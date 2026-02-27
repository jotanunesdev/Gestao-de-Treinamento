import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import styles from "./main.module.css"
import Button from "../../shared/ui/button/Button"
import Table, { type TableColumn } from "../../shared/ui/table/Table"
import Modal from "../../shared/ui/modal/Modal"
import FacialEnrollmentModal, {
  type FacialCaptureResult,
} from "../../shared/ui/facial/FacialEnrollmentModal"
import {
  fetchModules,
  fetchTrilhasByModule,
  fetchVideosByTrilha,
  type ModuleItem,
  type TrilhaItem,
  type VideoItem,
} from "../../shared/api/trainings"
import {
  attachCollectiveTrainingFaceEvidence,
  recordCollectiveTraining,
  submitCollectiveTrainingEfficacy,
} from "../../shared/api/userTrainings"
import { listCompanyEmployeeObras, listCompanyEmployees } from "../../shared/api/users"
import {
  fetchObjectiveProvaForPlayer,
  generateCollectiveIndividualProofQr,
  submitObjectiveProvaForCollective,
  type CollectiveIndividualProofQrResponse,
  type CollectiveObjectiveProvaSubmissionResult,
  type ObjectiveProvaPlayerRecord,
} from "../../shared/api/provas"
import { createCollectiveTurma, uploadCollectiveTurmaEvidence } from "../../shared/api/turmas"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import {
  TRAINING_EFFICACY_OPTIONS,
  TRAINING_EFFICACY_QUESTION,
} from "../../shared/constants/trainingEfficacy"

type EmployeeRow = {
  id: string
  NOME?: string
  NOME_FUNCAO?: string
  NOMEDEPARTAMENTO?: string
  CPF?: string
  CPF_SEARCH: string
  raw: Record<string, string>
}

type MaterialRow = {
  id: string
  ID: string
  TRILHA_ID: string
  VERSAO: number
  PATH_VIDEO: string | null
  PROCEDIMENTO_ID: string | null
  NORMA_ID: string | null
  TITULO: string
  MODULO_NOME: string
  TRILHA_TITULO: string
  ORDEM?: number | null
}

type CollectiveParticipant = {
  id: string
  cpf: string
  nome: string
  raw: Record<string, string>
}

type CollectiveProvaStep = {
  trilhaId: string
  trilhaTitulo: string
  prova: ObjectiveProvaPlayerRecord
}

type CollectiveIndividualQrState = Pick<
  CollectiveIndividualProofQrResponse,
  "token" | "redirectUrl" | "qrCodeImageUrl" | "expiresAt" | "totalUsuarios"
>

type TrilhaWithModule = TrilhaItem & {
  MODULO_NOME: string
}

const ALL_COMPANY_EMPLOYEES_FILTER = "__ALL_COMPANY_EMPLOYEES__"
const COLLECTIVE_LOCATION_MATRIZ = "__MATRIZ__"

type YouTubePlayer = {
  destroy: () => void
}

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onStateChange?: (event: { data: number }) => void
      }
    },
  ) => YouTubePlayer
  PlayerState: {
    ENDED: number
  }
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi
  onYouTubeIframeAPIReady?: () => void
}

let youTubeApiPromise: Promise<YouTubeApi> | null = null

const assetsBase = (import.meta.env.VITE_PUBLIC_ASSETS_URL ?? "").replace(/\/$/, "")

const decodePathSegment = (value: string) => {
  let current = value
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      break
    }
  }
  return current
}

const normalizePathname = (pathname: string) =>
  pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment
      return encodeURIComponent(decodePathSegment(segment))
    })
    .join("/")

const resolveAssetUrl = (path: string) => {
  if (!path) return ""
  const trimmed = path.trim()
  if (!trimmed) return ""

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      parsed.pathname = normalizePathname(parsed.pathname)
      return parsed.toString()
    } catch {
      return trimmed
    }
  }

  const cleanPath = trimmed.replace(/^\/+/, "")
  const [pathname, suffix = ""] = cleanPath.split(/(?=[?#])/, 2)
  const normalizedPath = normalizePathname(pathname)
  const base = assetsBase ? `${assetsBase}/${normalizedPath}` : `/${normalizedPath}`
  return `${base}${suffix}`
}

const getYouTubeId = (urlOrId: string) => {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId

  try {
    const u = new URL(urlOrId)
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "")
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v")
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/").pop() ?? null
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/").pop() ?? null
      if (u.pathname.startsWith("/live/")) return u.pathname.split("/").pop() ?? null
      return u.searchParams.get("v")
    }
    return null
  } catch {
    return null
  }
}

const decodeText = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const resolveVideoTitle = (pathVideo: string | null) => {
  if (!pathVideo) return "Video"
  try {
    const parsed = new URL(pathVideo)
    const title = parsed.searchParams.get("title")
    if (title) return decodeText(title)
  } catch {
    // ignore
  }

  const fileName = pathVideo.split("/").pop() ?? ""
  const noExtension = fileName.replace(/\.[^/.]+$/, "")
  const normalized = noExtension.replace(/[-_]+/g, " ").trim()
  return decodeText(normalized || "Video")
}

const loadYouTubeApi = () => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API unavailable"))
  }

  const currentWindow = window as YouTubeWindow
  if (currentWindow.YT?.Player) {
    return Promise.resolve(currentWindow.YT)
  }

  if (!youTubeApiPromise) {
    youTubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
      const existingScript = document.getElementById("youtube-iframe-api")
      if (!existingScript) {
        const script = document.createElement("script")
        script.id = "youtube-iframe-api"
        script.src = "https://www.youtube.com/iframe_api"
        script.async = true
        script.onerror = () => {
          youTubeApiPromise = null
          reject(new Error("YouTube API failed to load"))
        }
        document.head.appendChild(script)
      }

      const previousReady = currentWindow.onYouTubeIframeAPIReady
      currentWindow.onYouTubeIframeAPIReady = () => {
        if (typeof previousReady === "function") {
          previousReady()
        }

        if (currentWindow.YT?.Player) {
          resolve(currentWindow.YT)
        } else {
          reject(new Error("YouTube API unavailable"))
        }
      }
    })
  }

  return youTubeApiPromise
}

type QueuePlayerProps = {
  video: string
  title?: string
  autoplay?: boolean
  onEnded?: () => void
}

const QueuePlayer = ({ video, title, autoplay = false, onEnded }: QueuePlayerProps) => {
  const id = useMemo(() => getYouTubeId(video), [video])
  const playerRef = useRef<YouTubePlayer | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!id || !wrapperRef.current) {
      return undefined
    }

    let cancelled = false
    const wrapper = wrapperRef.current
    const host = document.createElement("div")
    host.style.width = "100%"
    host.style.height = "100%"
    wrapper.replaceChildren(host)

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) {
          return
        }

        if (playerRef.current) {
          try {
            playerRef.current.destroy()
          } catch {
            // ignore cleanup error
          }
        }

        playerRef.current = new YT.Player(host, {
          videoId: id,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: autoplay ? 1 : 0,
            rel: 0,
          },
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                onEnded?.()
              }
            },
          },
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch {
          // ignore cleanup error
        }
        playerRef.current = null
      }
      if (wrapper.isConnected) {
        wrapper.replaceChildren()
      }
    }
  }, [autoplay, id, onEnded])

  if (!id) {
    return <div className={styles.trainingPlayerPlaceholder}>Video indisponivel</div>
  }

  return (
    <div
      ref={wrapperRef}
      className={styles.trainingPlayerFrame}
      aria-label={title ?? "Video"}
    />
  )
}

const Instructor = () => {
  const { data } = useReadViewContext<ReadViewResponse>()
  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc
  const instructorCpf = (data?.User?.CPF ?? pfunc?.CPF ?? "").replace(/\D/g, "")

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [materials, setMaterials] = useState<MaterialRow[]>([])
  const [employeeObras, setEmployeeObras] = useState<Array<{ codigo: string | null; nome: string }>>(
    [],
  )
  const [selectedEmployeeObra, setSelectedEmployeeObra] = useState("")
  const [appliedEmployeeObra, setAppliedEmployeeObra] = useState<string | null>(null)
  const [isLoadingEmployeeList, setIsLoadingEmployeeList] = useState(false)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([])
  const [orderedMaterialIds, setOrderedMaterialIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isTrainingStarted, setIsTrainingStarted] = useState(false)
  const [isProvaPhase, setIsProvaPhase] = useState(false)
  const [collectiveProvas, setCollectiveProvas] = useState<CollectiveProvaStep[]>([])
  const [individualProvas, setIndividualProvas] = useState<CollectiveProvaStep[]>([])
  const [currentProvaIndex, setCurrentProvaIndex] = useState(0)
  const [collectiveAnswers, setCollectiveAnswers] = useState<
    Record<string, Record<string, string>>
  >({})
  const [collectiveResults, setCollectiveResults] = useState<
    Record<string, CollectiveObjectiveProvaSubmissionResult>
  >({})
  const [isSubmittingProva, setIsSubmittingProva] = useState(false)
  const [provaErrorMessage, setProvaErrorMessage] = useState<string | null>(null)
  const [currentMaterialId, setCurrentMaterialId] = useState<string | null>(null)
  const [isFinishingTraining, setIsFinishingTraining] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [draggedMaterialId, setDraggedMaterialId] = useState<string | null>(null)
  const [dropTargetMaterialId, setDropTargetMaterialId] = useState<string | null>(null)
  const [hasRecordedVideoCompletion, setHasRecordedVideoCompletion] = useState(false)
  const [showWorkflow, setShowWorkflow] = useState(false)
  const [isCollectiveSetupModalOpen, setIsCollectiveSetupModalOpen] = useState(false)
  const [collectiveTrainingLocationDraft, setCollectiveTrainingLocationDraft] = useState("")
  const [activeCollectiveTrainingLocation, setActiveCollectiveTrainingLocation] = useState<string | null>(
    null,
  )
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false)
  const [activeTurmaId, setActiveTurmaId] = useState<string | null>(null)
  const [activeTurmaNome, setActiveTurmaNome] = useState<string | null>(null)
  const [isCollectiveEvidenceModalOpen, setIsCollectiveEvidenceModalOpen] = useState(false)
  const [collectiveDurationHours, setCollectiveDurationHours] = useState(0)
  const [collectiveDurationMinutes, setCollectiveDurationMinutes] = useState(15)
  const [collectiveEvidenceFiles, setCollectiveEvidenceFiles] = useState<File[]>([])
  const [isSubmittingCollectiveEvidence, setIsSubmittingCollectiveEvidence] = useState(false)
  const [collectiveEvidenceError, setCollectiveEvidenceError] = useState<string | null>(null)
  const [isQrModalOpen, setIsQrModalOpen] = useState(false)
  const [isGeneratingQr, setIsGeneratingQr] = useState(false)
  const [collectiveQrError, setCollectiveQrError] = useState<string | null>(null)
  const [collectiveQrState, setCollectiveQrState] = useState<CollectiveIndividualQrState | null>(null)
  const [isEfficacyModalOpen, setIsEfficacyModalOpen] = useState(false)
  const [collectiveEfficacyLevels, setCollectiveEfficacyLevels] = useState<Record<string, number>>({})
  const [isSubmittingEfficacy, setIsSubmittingEfficacy] = useState(false)
  const [collectiveEfficacyError, setCollectiveEfficacyError] = useState<string | null>(null)
  const [pendingCollectiveFinalMessage, setPendingCollectiveFinalMessage] = useState<string | null>(
    null,
  )
  const evidenceInputRef = useRef<HTMLInputElement | null>(null)
  const instructorMediaRef = useRef<HTMLDivElement | null>(null)

  const participantsColumns = useMemo<TableColumn<EmployeeRow>[]>(
    () => [
      { key: "NOME", header: "Nome" },
      { key: "NOME_FUNCAO", header: "Funcao", render: (row) => row.NOME_FUNCAO ?? "-" },
      {
        key: "NOMEDEPARTAMENTO",
        header: "Departamento",
        render: (row) => row.NOMEDEPARTAMENTO ?? "-",
      },
    ],
    [],
  )

  const materialsColumns = useMemo<TableColumn<MaterialRow>[]>(
    () => [
      { key: "TITULO", header: "Video" },
      { key: "TRILHA_TITULO", header: "Trilha" },
      { key: "MODULO_NOME", header: "Modulo" },
    ],
    [],
  )

  const materialsMap = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials],
  )

  const orderedMaterials = useMemo(
    () =>
      orderedMaterialIds
        .map((id) => materialsMap.get(id))
        .filter((item): item is MaterialRow => Boolean(item)),
    [materialsMap, orderedMaterialIds],
  )

  const currentMaterial = useMemo(() => {
    if (!currentMaterialId) return null
    return materialsMap.get(currentMaterialId) ?? null
  }, [currentMaterialId, materialsMap])

  const collectiveTrilhas = useMemo(() => {
    const byId = new Map<string, { trilhaId: string; trilhaTitulo: string }>()
    for (const material of orderedMaterials) {
      if (!byId.has(material.TRILHA_ID)) {
        byId.set(material.TRILHA_ID, {
          trilhaId: material.TRILHA_ID,
          trilhaTitulo: material.TRILHA_TITULO,
        })
      }
    }
    return Array.from(byId.values())
  }, [orderedMaterials])

  const currentProvaStep = useMemo(() => {
    if (!isProvaPhase) return null
    return collectiveProvas[currentProvaIndex] ?? null
  }, [collectiveProvas, currentProvaIndex, isProvaPhase])

  const currentProvaAnswers = useMemo(() => {
    if (!currentProvaStep) return {}
    return collectiveAnswers[currentProvaStep.trilhaId] ?? {}
  }, [collectiveAnswers, currentProvaStep])

  const currentProvaAnsweredCount = useMemo(() => {
    if (!currentProvaStep) return 0
    return currentProvaStep.prova.QUESTOES.filter((question) =>
      Boolean(currentProvaAnswers[question.ID]),
    ).length
  }, [currentProvaAnswers, currentProvaStep])
  const hasIndividualProvas = individualProvas.length > 0

  const canOpenOrderModal =
    selectedParticipantIds.length > 0 && selectedMaterialIds.length > 0

  useEffect(() => {
    setOrderedMaterialIds((prev) => {
      const kept = prev.filter((id) => selectedMaterialIds.includes(id))
      const additions = selectedMaterialIds.filter((id) => !kept.includes(id))
      return [...kept, ...additions]
    })
  }, [selectedMaterialIds])

  useEffect(() => {
    if (!currentMaterialId || orderedMaterialIds.includes(currentMaterialId)) {
      return
    }

    setCurrentMaterialId(orderedMaterialIds[0] ?? null)
    setIsTrainingStarted(false)
  }, [currentMaterialId, orderedMaterialIds])

  const fetchEmployeeObras = useCallback(async () => {
    const response = await listCompanyEmployeeObras()
    return (response.obras ?? []).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }, [])

  const fetchEmployees = useCallback(async (obraNome?: string) => {
    const response =
      obraNome && obraNome !== ALL_COMPANY_EMPLOYEES_FILTER
        ? await listCompanyEmployees({ obra: obraNome })
        : await listCompanyEmployees()
    const mappedRows: EmployeeRow[] = []

    for (const employee of response.employees ?? []) {
      const cpfDigits = (employee.CPF ?? "").replace(/\D/g, "")
      if (cpfDigits.length !== 11) {
        continue
      }

      mappedRows.push({
        id: cpfDigits,
        NOME: employee.NOME ?? undefined,
        NOME_FUNCAO: employee.NOME_FUNCAO ?? undefined,
        NOMEDEPARTAMENTO: employee.NOMEDEPARTAMENTO ?? "-",
        CPF: cpfDigits,
        CPF_SEARCH: cpfDigits,
        raw: employee.raw ?? {
          CPF: cpfDigits,
          NOME: employee.NOME ?? "",
          NOME_FUNCAO: employee.NOME_FUNCAO ?? "",
          NOMEDEPARTAMENTO: employee.NOMEDEPARTAMENTO ?? "",
        },
      })
    }

    return mappedRows.sort((a, b) =>
      (a.NOME ?? "").localeCompare(b.NOME ?? "", "pt-BR"),
    )
  }, [])

  const fetchMaterials = useCallback(async () => {
    const modulesResponse = await fetchModules()
    const modules = modulesResponse.modules ?? []

    const trilhaResponses = await Promise.all(
      modules.map(async (moduleItem: ModuleItem) => {
        const response = await fetchTrilhasByModule(moduleItem.ID)
        return (response.trilhas ?? []).map((trilha) => ({
          ...trilha,
          MODULO_NOME: moduleItem.NOME,
        }))
      }),
    )

    const trilhas = trilhaResponses.flat() as TrilhaWithModule[]

    const videoResponses = await Promise.all(
      trilhas.map(async (trilhaItem) => {
        const response = await fetchVideosByTrilha(trilhaItem.ID)
        return {
          trilha: trilhaItem,
          videos: response.videos ?? [],
        }
      }),
    )

    const rows: MaterialRow[] = []
    for (const item of videoResponses) {
      const orderedVideos = [...item.videos].sort((a: VideoItem, b: VideoItem) => {
        const orderA = a.ORDEM ?? Number.MAX_SAFE_INTEGER
        const orderB = b.ORDEM ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return a.ID.localeCompare(b.ID)
      })

      for (const video of orderedVideos) {
        if (!video.PATH_VIDEO) continue
        rows.push({
          id: video.ID,
          ID: video.ID,
          TRILHA_ID: item.trilha.ID,
          VERSAO: video.VERSAO ?? 1,
          PATH_VIDEO: video.PATH_VIDEO,
          PROCEDIMENTO_ID: video.PROCEDIMENTO_ID ?? null,
          NORMA_ID: video.NORMA_ID ?? null,
          TITULO: resolveVideoTitle(video.PATH_VIDEO),
          MODULO_NOME: item.trilha.MODULO_NOME,
          TRILHA_TITULO: item.trilha.TITULO,
          ORDEM: video.ORDEM,
        })
      }
    }

    return rows.sort((a, b) => {
      const byModule = a.MODULO_NOME.localeCompare(b.MODULO_NOME, "pt-BR")
      if (byModule !== 0) return byModule
      const byTrilha = a.TRILHA_TITULO.localeCompare(b.TRILHA_TITULO, "pt-BR")
      if (byTrilha !== 0) return byTrilha
      const orderA = a.ORDEM ?? Number.MAX_SAFE_INTEGER
      const orderB = b.ORDEM ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.TITULO.localeCompare(b.TITULO, "pt-BR")
    })
  }, [])

  const handleOpenCollectiveSetupModal = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
      if (employeeObras.length === 0) {
        const obrasRows = await fetchEmployeeObras()
        setEmployeeObras(obrasRows)
      }
      setCollectiveTrainingLocationDraft((prev) => prev || COLLECTIVE_LOCATION_MATRIZ)
      setIsCollectiveSetupModalOpen(true)
    } catch (error) {
      console.error("Erro ao carregar obras para treinamento coletivo:", error)
      setErrorMessage("Nao foi possivel carregar as obras para iniciar o treinamento coletivo.")
    } finally {
      setIsLoading(false)
    }
  }, [employeeObras.length, fetchEmployeeObras])

  const handleNewCollectiveTraining = useCallback(async (trainingLocation: string) => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
      setFeedbackMessage(null)
      setShowWorkflow(false)
      setIsCollectiveSetupModalOpen(false)

      const [obrasRows, materialsRows] = await Promise.all([
        fetchEmployeeObras(),
        fetchMaterials(),
      ])

      setEmployeeObras(obrasRows)
      setEmployees([])
      setSelectedEmployeeObra("")
      setAppliedEmployeeObra(null)
      setMaterials(materialsRows)
      setSelectedParticipantIds([])
      setSelectedMaterialIds([])
      setOrderedMaterialIds([])
      setCurrentMaterialId(null)
      setIsTrainingStarted(false)
      setIsProvaPhase(false)
      setCollectiveProvas([])
      setIndividualProvas([])
      setCurrentProvaIndex(0)
      setCollectiveAnswers({})
      setCollectiveResults({})
      setProvaErrorMessage(null)
      setHasRecordedVideoCompletion(false)
      setIsFaceModalOpen(false)
      setIsCollectiveEvidenceModalOpen(false)
      setIsQrModalOpen(false)
      setIsEfficacyModalOpen(false)
      setCollectiveDurationHours(0)
      setCollectiveDurationMinutes(15)
      setCollectiveEvidenceFiles([])
      setCollectiveEvidenceError(null)
      setCollectiveQrState(null)
      setCollectiveQrError(null)
      setIsGeneratingQr(false)
      setCollectiveEfficacyLevels({})
      setCollectiveEfficacyError(null)
      setPendingCollectiveFinalMessage(null)
      setActiveTurmaId(null)
      setActiveTurmaNome(null)
      setActiveCollectiveTrainingLocation(trainingLocation)
      setShowWorkflow(true)
    } catch (error) {
      console.error("Erro ao preparar treinamento coletivo:", error)
      setErrorMessage("Nao foi possivel carregar obras e videos.")
    } finally {
      setIsLoading(false)
    }
  }, [fetchEmployeeObras, fetchMaterials])

  const handleSearchEmployeesByObra = useCallback(async () => {
    const obraNome = selectedEmployeeObra.trim()
    if (!obraNome) {
      setErrorMessage("Selecione uma obra para buscar os participantes.")
      return
    }

    try {
      setIsLoadingEmployeeList(true)
      setErrorMessage(null)
      const employeesRows = await fetchEmployees(obraNome)
      setEmployees(employeesRows)
      setAppliedEmployeeObra(obraNome)
      setSelectedParticipantIds([])
    } catch (error) {
      console.error("Erro ao buscar funcionarios por obra:", error)
      setErrorMessage("Nao foi possivel carregar os funcionarios da obra selecionada.")
    } finally {
      setIsLoadingEmployeeList(false)
    }
  }, [fetchEmployees, selectedEmployeeObra])

  const moveMaterial = useCallback((sourceId: string, targetId: string) => {
    setOrderedMaterialIds((prev) => {
      const sourceIndex = prev.indexOf(sourceId)
      const targetIndex = prev.indexOf(targetId)

      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return prev
      }

      const next = [...prev]
      const [removed] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, removed)
      return next
    })
  }, [])

  const selectedParticipants = useMemo(
    () => employees.filter((employee) => selectedParticipantIds.includes(employee.id)),
    [employees, selectedParticipantIds],
  )

  const requiresFacialValidation = useMemo(
    () =>
      orderedMaterials.some(
        (material) => Boolean(material.PROCEDIMENTO_ID) || Boolean(material.NORMA_ID),
      ),
    [orderedMaterials],
  )

  const faceParticipants = useMemo(
    () =>
      selectedParticipants
        .map((participant) => {
          const cpf = (participant.CPF ?? participant.raw.CPF ?? "").replace(/\D/g, "")
          if (cpf.length !== 11) return null
          return {
            id: participant.id,
            cpf,
            nome: participant.NOME ?? participant.raw.NOME ?? "Colaborador",
            raw: participant.raw,
          }
        })
        .filter((participant): participant is CollectiveParticipant => Boolean(participant)),
    [selectedParticipants],
  )

  const efficacyParticipants = useMemo<CollectiveParticipant[]>(
    () => faceParticipants,
    [faceParticipants],
  )

  const openCollectiveEfficacyModal = useCallback((finalMessage: string) => {
    setCollectiveEfficacyLevels({})
    setCollectiveEfficacyError(null)
    setPendingCollectiveFinalMessage(finalMessage)
    setIsEfficacyModalOpen(true)
  }, [])

  const openCollectiveEvidenceModal = useCallback((finalMessage: string) => {
    setCollectiveDurationHours(0)
    setCollectiveDurationMinutes(15)
    setCollectiveEvidenceFiles([])
    setCollectiveEvidenceError(null)
    setPendingCollectiveFinalMessage(finalMessage)
    setIsCollectiveEvidenceModalOpen(true)
    if (evidenceInputRef.current) {
      evidenceInputRef.current.value = ""
    }
  }, [])

  const openCollectiveIndividualQrModal = useCallback(
    async (finalMessage?: string | null) => {
      if (!activeTurmaId) {
        setErrorMessage("Turma nao identificada para gerar o QR Code da prova individual.")
        return
      }
      if (!individualProvas.length) {
        if (finalMessage) {
          setFeedbackMessage(finalMessage)
        }
        return
      }

      try {
        setIsGeneratingQr(true)
        setCollectiveQrError(null)
        const response = await generateCollectiveIndividualProofQr({
          users: selectedParticipants.map((employee) => employee.raw),
          trilhaIds: individualProvas.map((item) => item.trilhaId),
          turmaId: activeTurmaId,
        })

        setCollectiveQrState({
          token: response.token,
          redirectUrl: response.redirectUrl,
          qrCodeImageUrl: response.qrCodeImageUrl,
          expiresAt: response.expiresAt,
          totalUsuarios: response.totalUsuarios,
        })
        setIsQrModalOpen(true)
        if (finalMessage) {
          setFeedbackMessage(`${finalMessage} QR Code da prova individual gerado.`)
        } else {
          setFeedbackMessage("QR Code da prova individual gerado para os participantes.")
        }
      } catch (error) {
        console.error("Erro ao gerar QR Code da prova individual:", error)
        setCollectiveQrError(
          error instanceof Error
            ? error.message
            : "Nao foi possivel gerar o QR Code da prova individual.",
        )
      } finally {
        setIsGeneratingQr(false)
      }
    },
    [activeTurmaId, individualProvas, selectedParticipants],
  )

  const loadCollectiveProvas = useCallback(async () => {
    const collectiveSteps: CollectiveProvaStep[] = []
    const individualSteps: CollectiveProvaStep[] = []
    const trilhasSemProva: string[] = []

    for (const trilha of collectiveTrilhas) {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetchObjectiveProvaForPlayer(trilha.trilhaId)
      const prova = response.prova
      if (!prova) {
        trilhasSemProva.push(trilha.trilhaTitulo)
        continue
      }

      const nextStep = {
        trilhaId: trilha.trilhaId,
        trilhaTitulo: trilha.trilhaTitulo,
        prova,
      }
      if (prova.MODO_APLICACAO === "individual") {
        individualSteps.push(nextStep)
      } else {
        collectiveSteps.push(nextStep)
      }
    }

    if (trilhasSemProva.length > 0) {
      throw new Error(
        `As trilhas selecionadas sem prova objetiva sao: ${trilhasSemProva.join(", ")}`,
      )
    }

    return {
      collectiveSteps,
      individualSteps,
    }
  }, [collectiveTrilhas])

  const finalizeCollectiveVideoAttendance = useCallback(async () => {
    if (hasRecordedVideoCompletion || isFinishingTraining) {
      return true
    }

    try {
      setIsFinishingTraining(true)
      await recordCollectiveTraining({
        users: selectedParticipants.map((employee) => employee.raw),
        trainings: orderedMaterials.map((material) => ({
          tipo: "video",
          materialId: material.ID,
          materialVersao: material.VERSAO,
        })),
        turmaId: activeTurmaId ?? undefined,
        concluidoEm: new Date().toISOString(),
        origem: "instrutor",
      })

      setHasRecordedVideoCompletion(true)
      setErrorMessage(null)
      return true
    } catch (error) {
      console.error("Erro ao registrar conclusao coletiva:", error)
      setErrorMessage("Os videos foram finalizados, mas houve erro ao registrar presenca.")
      return false
    } finally {
      setIsFinishingTraining(false)
    }
  }, [
    activeTurmaId,
    hasRecordedVideoCompletion,
    isFinishingTraining,
    orderedMaterials,
    selectedParticipants,
  ])

  const handleSelectCollectiveAnswer = useCallback(
    (questionId: string, optionId: string) => {
      if (!currentProvaStep) return

      setCollectiveAnswers((prev) => ({
        ...prev,
        [currentProvaStep.trilhaId]: {
          ...(prev[currentProvaStep.trilhaId] ?? {}),
          [questionId]: optionId,
        },
      }))
    },
    [currentProvaStep],
  )

  const handleSubmitCollectiveProva = useCallback(async () => {
    if (!currentProvaStep || isSubmittingProva) {
      return
    }

    const answers = collectiveAnswers[currentProvaStep.trilhaId] ?? {}
    const unanswered = currentProvaStep.prova.QUESTOES.filter(
      (question) => !answers[question.ID],
    )
    if (unanswered.length > 0) {
      setProvaErrorMessage("Responda todas as questoes da prova antes de enviar.")
      return
    }

    try {
      setIsSubmittingProva(true)
      setProvaErrorMessage(null)

      const result = await submitObjectiveProvaForCollective({
        trilhaId: currentProvaStep.trilhaId,
        users: selectedParticipants.map((employee) => employee.raw),
        respostas: currentProvaStep.prova.QUESTOES.map((question) => ({
          questaoId: question.ID,
          opcaoId: answers[question.ID],
        })),
        turmaId: activeTurmaId ?? undefined,
        concluidoEm: new Date().toISOString(),
        origem: "instrutor-coletivo",
      })

      setCollectiveResults((prev) => ({
        ...prev,
        [currentProvaStep.trilhaId]: result,
      }))

      const nextIndex = currentProvaIndex + 1
      if (nextIndex < collectiveProvas.length) {
        setCurrentProvaIndex(nextIndex)
        setFeedbackMessage(
          `Prova da trilha ${currentProvaStep.trilhaTitulo} registrada para ${result.usuariosAvaliados} colaboradores.`,
        )
      } else {
        setIsProvaPhase(false)
        if (hasIndividualProvas) {
          openCollectiveEvidenceModal(
            "Provas coletivas concluidas. Registre as evidencias para gerar o QR Code das provas individuais.",
          )
          return
        }
        if (requiresFacialValidation && faceParticipants.length > 0) {
          setIsModalOpen(false)
          setIsFaceModalOpen(true)
          setFeedbackMessage(
            "Treinamento coletivo finalizado. Resultado da prova atribuido. Realize agora a validacao facial.",
          )
        } else {
          openCollectiveEvidenceModal(
            "Treinamento coletivo finalizado. Resultado da prova atribuido a todos os colaboradores.",
          )
        }
      }
      setErrorMessage(null)
    } catch (error) {
      console.error("Erro ao enviar prova coletiva:", error)
      setProvaErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel registrar a prova coletiva.",
      )
    } finally {
      setIsSubmittingProva(false)
    }
  }, [
    activeTurmaId,
    collectiveAnswers,
    collectiveProvas.length,
    currentProvaIndex,
    currentProvaStep,
    faceParticipants.length,
    hasIndividualProvas,
    isSubmittingProva,
    openCollectiveEvidenceModal,
    requiresFacialValidation,
    selectedParticipants,
  ])

  const advanceToNextMaterial = useCallback(async () => {
    if (!currentMaterialId) return

    const currentIndex = orderedMaterialIds.indexOf(currentMaterialId)
    if (currentIndex < 0) return

    const nextMaterialId = orderedMaterialIds[currentIndex + 1]
    if (nextMaterialId) {
      setCurrentMaterialId(nextMaterialId)
      return
    }

    setIsTrainingStarted(false)
    setCurrentMaterialId(null)

    const didRecordAttendance = await finalizeCollectiveVideoAttendance()
    if (!didRecordAttendance) {
      return
    }

    if (collectiveProvas.length > 0) {
      setIsProvaPhase(true)
      setCurrentProvaIndex(0)
      setFeedbackMessage("Videos concluidos. Aplique agora a prova objetiva coletiva.")
      return
    }

    if (hasIndividualProvas) {
      openCollectiveEvidenceModal(
        "Videos concluidos. Registre as evidencias para gerar o QR Code das provas individuais.",
      )
      return
    }

    if (requiresFacialValidation && faceParticipants.length > 0) {
      setIsModalOpen(false)
      setIsFaceModalOpen(true)
      setFeedbackMessage(
        "Treinamento coletivo finalizado. Realize agora a validacao facial para concluir.",
      )
      return
    }

    openCollectiveEvidenceModal("Treinamento coletivo finalizado e presenca registrada.")
  }, [
    collectiveProvas.length,
    currentMaterialId,
    faceParticipants.length,
    finalizeCollectiveVideoAttendance,
    hasIndividualProvas,
    openCollectiveEvidenceModal,
    orderedMaterialIds,
    requiresFacialValidation,
  ])

  const handleStartTraining = useCallback(async () => {
    if (orderedMaterials.length === 0) {
      return
    }
    if (selectedParticipants.length === 0) {
      setErrorMessage("Selecione ao menos um participante para iniciar.")
      return
    }

    try {
      setIsLoading(true)
      setErrorMessage(null)
      setFeedbackMessage(null)
      setProvaErrorMessage(null)

      if (!activeTurmaId) {
        const startedAt = new Date()
        const defaultTurmaName = `Turma coletiva ${startedAt.toLocaleString("pt-BR")}`
        const response = await createCollectiveTurma({
          nome: defaultTurmaName,
          users: selectedParticipants.map((employee) => employee.raw),
          criadoPor: instructorCpf || undefined,
          iniciadoEm: startedAt.toISOString(),
          obraLocal:
            activeCollectiveTrainingLocation && activeCollectiveTrainingLocation !== COLLECTIVE_LOCATION_MATRIZ
              ? activeCollectiveTrainingLocation
              : "Matriz",
        })

        if (!response.turma?.ID) {
          throw new Error("Nao foi possivel criar a turma do treinamento coletivo.")
        }

        setActiveTurmaId(response.turma.ID)
        setActiveTurmaNome(response.turma.NOME ?? defaultTurmaName)
      }

      const loadedProvas = await loadCollectiveProvas()
      setCollectiveProvas(loadedProvas.collectiveSteps)
      setIndividualProvas(loadedProvas.individualSteps)
      setCollectiveAnswers({})
      setCollectiveResults({})
      setCurrentProvaIndex(0)
      setIsProvaPhase(false)
      setHasRecordedVideoCompletion(false)

      setCurrentMaterialId(orderedMaterials[0].id)
      setIsTrainingStarted(true)
    } catch (error) {
      console.error("Erro ao iniciar treinamento coletivo:", error)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Nao foi possivel iniciar o treinamento coletivo.",
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    activeTurmaId,
    instructorCpf,
    loadCollectiveProvas,
    orderedMaterials,
    selectedParticipants,
  ])

  const handleOpenOrderModal = () => {
    if (!canOpenOrderModal) {
      return
    }

    setIsModalOpen(true)
    setIsTrainingStarted(false)
    setIsProvaPhase(false)
    setCurrentMaterialId(orderedMaterialIds[0] ?? null)
    setCollectiveProvas([])
    setIndividualProvas([])
    setCollectiveAnswers({})
    setCollectiveResults({})
    setCurrentProvaIndex(0)
    setProvaErrorMessage(null)
    setHasRecordedVideoCompletion(false)
    setIsFaceModalOpen(false)
    setIsCollectiveEvidenceModalOpen(false)
    setIsQrModalOpen(false)
    setIsEfficacyModalOpen(false)
    setCollectiveDurationHours(0)
    setCollectiveDurationMinutes(15)
    setCollectiveEvidenceFiles([])
    setCollectiveEvidenceError(null)
    setCollectiveQrState(null)
    setCollectiveQrError(null)
    setIsGeneratingQr(false)
    setCollectiveEfficacyLevels({})
    setCollectiveEfficacyError(null)
    setPendingCollectiveFinalMessage(null)
    setActiveTurmaId(null)
    setActiveTurmaNome(null)
    setFeedbackMessage(null)
    setErrorMessage(null)
  }

  const handleCloseOrderModal = () => {
    setIsModalOpen(false)
    setIsTrainingStarted(false)
    setIsProvaPhase(false)
    setCurrentMaterialId(null)
    setCollectiveProvas([])
    setIndividualProvas([])
    setCollectiveAnswers({})
    setCollectiveResults({})
    setCurrentProvaIndex(0)
    setProvaErrorMessage(null)
    setDraggedMaterialId(null)
    setDropTargetMaterialId(null)
    setActiveTurmaId(null)
    setActiveTurmaNome(null)
    setIsCollectiveEvidenceModalOpen(false)
    setIsQrModalOpen(false)
    setIsEfficacyModalOpen(false)
    setCollectiveDurationHours(0)
    setCollectiveDurationMinutes(15)
    setCollectiveEvidenceFiles([])
    setCollectiveEvidenceError(null)
    setCollectiveQrState(null)
    setCollectiveQrError(null)
    setIsGeneratingQr(false)
    setCollectiveEfficacyLevels({})
    setCollectiveEfficacyError(null)
    setPendingCollectiveFinalMessage(null)
  }

  const handleFaceCompleted = useCallback(
    async (captures: FacialCaptureResult[]) => {
      setIsFaceModalOpen(false)
      setErrorMessage(null)

      try {
        if (activeTurmaId && captures.length) {
          await attachCollectiveTrainingFaceEvidence({
            turmaId: activeTurmaId,
            obraLocal:
              activeCollectiveTrainingLocation &&
              activeCollectiveTrainingLocation !== COLLECTIVE_LOCATION_MATRIZ
                ? activeCollectiveTrainingLocation
                : "Matriz",
            captures: captures.map((capture) => ({
              cpf: capture.cpf,
              fotoBase64: capture.fotoUrl ? null : (capture.fotoBase64 ?? null),
              fotoUrl: capture.fotoUrl ?? null,
              createdAt: capture.createdAt,
            })),
          })
        }
      } catch (error) {
        console.error("Erro ao vincular foto facial aos treinamentos da turma:", error)
        setErrorMessage(
          "Validacao facial concluida, mas houve erro ao vincular a foto de confirmacao aos treinamentos do dossie.",
        )
      }
      openCollectiveEvidenceModal(
        `Validacao facial concluida para ${captures.length} participante(s).${
          activeTurmaNome ? ` Turma ${activeTurmaNome} finalizada.` : " Treinamento coletivo finalizado."
        }`,
      )
    },
    [
      activeCollectiveTrainingLocation,
      activeTurmaId,
      activeTurmaNome,
      openCollectiveEvidenceModal,
    ],
  )

  const handleCollectiveEvidenceFilesChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    )
    setCollectiveEvidenceFiles(nextFiles)
    setCollectiveEvidenceError(null)
  }, [])

  const handleRemoveCollectiveEvidenceFile = useCallback((indexToRemove: number) => {
    setCollectiveEvidenceFiles((prev) => prev.filter((_, index) => index !== indexToRemove))
    setCollectiveEvidenceError(null)
  }, [])

  const canSubmitCollectiveEvidence =
    Boolean(activeTurmaId) &&
    collectiveEvidenceFiles.length > 0 &&
    collectiveDurationHours * 60 + collectiveDurationMinutes > 0

  const handleSubmitCollectiveEvidence = useCallback(async () => {
    if (!activeTurmaId) {
      setCollectiveEvidenceError("Turma nao identificada para registrar evidencias.")
      return
    }

    const duracaoTotalMinutos = collectiveDurationHours * 60 + collectiveDurationMinutes
    if (duracaoTotalMinutos <= 0) {
      setCollectiveEvidenceError("Informe a duracao do treinamento.")
      return
    }

    if (collectiveEvidenceFiles.length === 0) {
      setCollectiveEvidenceError("Adicione ao menos uma foto de evidencia.")
      return
    }

    try {
      setIsSubmittingCollectiveEvidence(true)
      setCollectiveEvidenceError(null)

      await uploadCollectiveTurmaEvidence({
        turmaId: activeTurmaId,
        duracaoHoras: collectiveDurationHours,
        duracaoMinutos: collectiveDurationMinutes,
        criadoPor: instructorCpf || undefined,
        finalizadoEm: new Date().toISOString(),
        obraLocal:
          activeCollectiveTrainingLocation && activeCollectiveTrainingLocation !== COLLECTIVE_LOCATION_MATRIZ
            ? activeCollectiveTrainingLocation
            : "Matriz",
        files: collectiveEvidenceFiles,
      })

      setIsCollectiveEvidenceModalOpen(false)
      setCollectiveEvidenceFiles([])
      if (evidenceInputRef.current) {
        evidenceInputRef.current.value = ""
      }
      const nextMessage = pendingCollectiveFinalMessage
        ? `${pendingCollectiveFinalMessage} Evidencias registradas.`
        : "Evidencias do treinamento registradas."
      if (hasIndividualProvas) {
        await openCollectiveIndividualQrModal(nextMessage)
      } else {
        openCollectiveEfficacyModal(nextMessage)
      }
    } catch (error) {
      console.error("Erro ao registrar evidencias do treinamento coletivo:", error)
      setCollectiveEvidenceError(
        error instanceof Error
          ? error.message
          : "Nao foi possivel registrar as evidencias do treinamento coletivo.",
      )
    } finally {
      setIsSubmittingCollectiveEvidence(false)
    }
  }, [
    activeCollectiveTrainingLocation,
    activeCollectiveTrainingLocation,
    activeTurmaId,
    collectiveDurationHours,
    collectiveDurationMinutes,
    collectiveEvidenceFiles,
    instructorCpf,
    hasIndividualProvas,
    openCollectiveIndividualQrModal,
    openCollectiveEfficacyModal,
    pendingCollectiveFinalMessage,
  ])

  const currentProvaResult = currentProvaStep
    ? collectiveResults[currentProvaStep.trilhaId] ?? null
    : null

  const currentProvaTotalQuestions = currentProvaStep?.prova.QUESTOES.length ?? 0

  const canSubmitCurrentProva =
    Boolean(currentProvaStep) &&
    currentProvaAnsweredCount === currentProvaTotalQuestions &&
    currentProvaTotalQuestions > 0

  const handleRetryCurrentProva = useCallback(() => {
    if (!currentProvaStep) return
    setCollectiveAnswers((prev) => ({
      ...prev,
      [currentProvaStep.trilhaId]: {},
    }))
    setCollectiveResults((prev) => {
      const next = { ...prev }
      delete next[currentProvaStep.trilhaId]
      return next
    })
    setProvaErrorMessage(null)
  }, [currentProvaStep])

  const hasAllCollectiveProvasSubmitted =
    collectiveProvas.length > 0 &&
    collectiveProvas.every((step) => Boolean(collectiveResults[step.trilhaId]))

  const collectiveSummaryMessage =
    hasAllCollectiveProvasSubmitted && collectiveProvas.length > 0
      ? "Todas as provas coletivas foram registradas para os colaboradores selecionados."
      : null

  const isQueueInteractionBlocked = isTrainingStarted || isProvaPhase

  const collectiveEfficacyAnsweredCount = useMemo(
    () =>
      efficacyParticipants.filter(
        (participant) =>
          Number.isInteger(collectiveEfficacyLevels[participant.cpf]) &&
          collectiveEfficacyLevels[participant.cpf] >= 1,
      ).length,
    [collectiveEfficacyLevels, efficacyParticipants],
  )

  const canSubmitCollectiveEfficacy =
    efficacyParticipants.length > 0 && collectiveEfficacyAnsweredCount === efficacyParticipants.length

  const handleEnterCollectiveFullscreen = useCallback(async () => {
    const target = instructorMediaRef.current
    if (!target || typeof target.requestFullscreen !== "function") return

    try {
      await target.requestFullscreen()
      const orientationApi = screen.orientation as
        | (ScreenOrientation & { lock?: (orientation: "portrait" | "landscape" | "any") => Promise<void> })
        | undefined
      if (window.matchMedia("(max-width: 1024px)").matches && orientationApi?.lock) {
        await orientationApi.lock("landscape").catch(() => undefined)
      }
    } catch {
      // ignore fullscreen errors
    }
  }, [])

  const handleSubmitCollectiveEfficacy = useCallback(async () => {
    if (!activeTurmaId) {
      setCollectiveEfficacyError("Turma nao identificada para registrar a avaliacao de eficacia.")
      return
    }
    if (!canSubmitCollectiveEfficacy) {
      setCollectiveEfficacyError(
        "Selecione uma opcao de avaliacao de eficacia para todos os participantes.",
      )
      return
    }

    try {
      setIsSubmittingEfficacy(true)
      setCollectiveEfficacyError(null)
      await submitCollectiveTrainingEfficacy({
        turmaId: activeTurmaId,
        avaliadoEm: new Date().toISOString(),
        avaliacoes: efficacyParticipants.map((participant) => ({
          cpf: participant.cpf,
          nivel: collectiveEfficacyLevels[participant.cpf],
        })),
      })

      setIsEfficacyModalOpen(false)
      setFeedbackMessage(
        pendingCollectiveFinalMessage
          ? `${pendingCollectiveFinalMessage} Avaliacao de eficacia registrada.`
          : "Avaliacao de eficacia registrada com sucesso.",
      )
      setPendingCollectiveFinalMessage(null)
    } catch (error) {
      console.error("Erro ao registrar avaliacao de eficacia coletiva:", error)
      setCollectiveEfficacyError(
        error instanceof Error
          ? error.message
          : "Nao foi possivel registrar a avaliacao de eficacia coletiva.",
      )
    } finally {
      setIsSubmittingEfficacy(false)
    }
  }, [
    activeTurmaId,
    canSubmitCollectiveEfficacy,
    collectiveEfficacyLevels,
    efficacyParticipants,
    pendingCollectiveFinalMessage,
  ])

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Instrutor</h1>
          <p className={styles.navSubtitle}>Monte e conduza treinamentos coletivos.</p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <div className={styles.header_content}>
            <div>
              <h2>Treinamento coletivo</h2>
              <p>Selecione participantes, escolha videos e organize a sequencia.</p>
            </div>
            <Button
              text="Novo Treinamento Coletivo"
              onClick={() => {
                void handleOpenCollectiveSetupModal()
              }}
              isLoading={isLoading}
            />
          </div>

          {errorMessage ? <p className={styles.settingsFeedbackError}>{errorMessage}</p> : null}
          {feedbackMessage ? <p className={styles.settingsFeedbackSuccess}>{feedbackMessage}</p> : null}

          {showWorkflow ? (
            <div className={styles.tables_content}>
              <div className={styles.trainingTableSection}>
                <h4>Participantes</h4>
                <div className={styles.trainingEmployeeFilterRow}>
                  <label className={styles.trainingEmployeeFilterField}>
                    <span>Obra</span>
                    <select
                      className={styles.trainingEmployeeFilterSelect}
                      value={selectedEmployeeObra}
                      onChange={(event) => {
                        setSelectedEmployeeObra(event.target.value)
                        setAppliedEmployeeObra(null)
                        setEmployees([])
                        setSelectedParticipantIds([])
                      }}
                      disabled={isLoadingEmployeeList}
                    >
                      <option value="">Selecione uma obra</option>
                      <option value={ALL_COMPANY_EMPLOYEES_FILTER}>
                        Todos os funcionarios da empresa
                      </option>
                      {employeeObras.map((obra) => (
                        <option key={`${obra.codigo ?? obra.nome}-${obra.nome}`} value={obra.nome}>
                          {obra.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.trainingEmployeeFilterButton}>
                    <Button
                      text="Buscar"
                      onClick={() => {
                        void handleSearchEmployeesByObra()
                      }}
                      isLoading={isLoadingEmployeeList}
                      disabled={!selectedEmployeeObra.trim() || isLoadingEmployeeList}
                    />
                  </div>
                </div>
                {!appliedEmployeeObra ? (
                  <p className={styles.trainingEmployeeFilterHint}>
                    Selecione uma obra (ou <strong>Todos os funcionarios da empresa</strong>) e
                    clique em <strong>Buscar</strong> para carregar os participantes.
                  </p>
                ) : null}
                <Table
                  columns={participantsColumns}
                  data={employees}
                  selectable
                  searchable={Boolean(appliedEmployeeObra)}
                  searchableKeys={["NOME", "CPF_SEARCH"]}
                  onSelectionChange={setSelectedParticipantIds}
                  selectedRowIds={selectedParticipantIds}
                  getRowId={(row) => row.id}
                  emptyMessage={
                    appliedEmployeeObra
                      ? "Nenhum funcionario encontrado para a obra selecionada."
                      : "Selecione uma obra (ou todos os funcionarios) e clique em Buscar."
                  }
                  searchPlaceholder="Buscar por nome ou CPF"
                  pageSize={10}
                />
              </div>

              <div className={styles.trainingTableSection}>
                <h4>Videos disponiveis</h4>
                <Table
                  columns={materialsColumns}
                  data={materials}
                  selectable
                  searchable
                  searchableKeys={["TITULO", "TRILHA_TITULO", "MODULO_NOME"]}
                  onSelectionChange={setSelectedMaterialIds}
                  selectedRowIds={selectedMaterialIds}
                  getRowId={(row) => row.id}
                  emptyMessage="Nenhum video encontrado."
                  searchPlaceholder="Buscar por video, trilha ou modulo"
                  pageSize={8}
                />
              </div>

              <div className={styles.trainingAction}>
                <div className={styles.trainingActionInfo}>
                  <span className={styles.trainingActionTitle}>Pronto para ordenar?</span>
                  <span className={styles.trainingActionHint}>
                    {selectedParticipantIds.length} participantes e {selectedMaterialIds.length} videos selecionados.
                  </span>
                  {requiresFacialValidation ? (
                    <span className={styles.trainingActionHint}>
                      Este treinamento possui material vinculado a procedimento ou norma e exigira validacao facial ao final.
                    </span>
                  ) : null}
                </div>
                <Button
                  text="Ordenar Treinamento"
                  onClick={handleOpenOrderModal}
                  disabled={!canOpenOrderModal}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        open={isCollectiveSetupModalOpen}
        onClose={() => {
          if (!isLoading) {
            setIsCollectiveSetupModalOpen(false)
          }
        }}
        size="md"
        title="Novo Treinamento Coletivo"
      >
        <div className={styles.trainingEvidenceModal}>
          <p className={styles.trainingEficacyQuestion}>
            Selecione em qual <strong>obra/local</strong> o treinamento sera ministrado.
          </p>
          <p className={styles.trainingEficacyHint}>
            Use <strong>Matriz</strong> quando o treinamento for realizado na matriz.
          </p>

          <label className={styles.trainingEmployeeFilterField}>
            <span>Obra / Local</span>
            <select
              className={styles.trainingEmployeeFilterSelect}
              value={collectiveTrainingLocationDraft}
              onChange={(event) => setCollectiveTrainingLocationDraft(event.target.value)}
              disabled={isLoading}
            >
              <option value="">Selecione a obra/local</option>
              <option value={COLLECTIVE_LOCATION_MATRIZ}>Matriz</option>
              {employeeObras.map((obra) => (
                <option key={`setup-obra-${obra.codigo ?? obra.nome}-${obra.nome}`} value={obra.nome}>
                  {obra.nome}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.trainingProvaActions}>
            <Button
              text="Continuar"
              onClick={() => {
                const selected = collectiveTrainingLocationDraft.trim()
                if (!selected) {
                  setErrorMessage("Selecione a obra/local para iniciar o treinamento coletivo.")
                  return
                }
                void handleNewCollectiveTraining(
                  selected === COLLECTIVE_LOCATION_MATRIZ ? "Matriz" : selected,
                )
              }}
              isLoading={isLoading}
              disabled={!collectiveTrainingLocationDraft.trim() || isLoading}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={isModalOpen}
        onClose={handleCloseOrderModal}
        size="full"
        title="Treinamento Coletivo"
      >
        <div className={styles.trainingModal}>
          <div className={styles.trainingModalHeader}>
            <div>
              <h4 className={styles.trainingModalTitle}>
                {isProvaPhase ? "Prova coletiva" : "Ordene e inicie o treinamento"}
              </h4>
              <p className={styles.trainingModalHint}>
                {isProvaPhase
                  ? "Responda a prova em grupo. O resultado sera aplicado para todos os participantes."
                  : "Arraste os videos na fila da direita para ajustar a sequencia."}
              </p>
              {activeTurmaNome ? (
                <p className={styles.trainingQueueMeta}>Turma ativa: {activeTurmaNome}</p>
              ) : null}
            </div>
            {!isProvaPhase ? (
              <Button
                text={isTrainingStarted ? "Reiniciar Treinamento" : "Iniciar Treinamento"}
                onClick={() => {
                  void handleStartTraining()
                }}
                disabled={orderedMaterials.length === 0 || isFinishingTraining || isLoading}
                isLoading={isLoading}
              />
            ) : null}
          </div>

          <div className={styles.trainingModalBody}>
            <div className={styles.trainingPlayerPanel}>
              <div className={styles.trainingPlayerHeader}>
                <span className={styles.trainingPlayerTitle}>
                  {isProvaPhase
                    ? currentProvaStep?.prova.TITULO ?? "Prova objetiva"
                    : currentMaterial?.TITULO ?? "Selecione um video"}
                </span>
                <span className={styles.trainingPlayerMeta}>
                  {isProvaPhase
                    ? currentProvaStep
                      ? `${currentProvaAnsweredCount}/${currentProvaTotalQuestions} questoes respondidas`
                      : ""
                    : currentMaterial
                      ? `${currentMaterial.TRILHA_TITULO} - ${currentMaterial.MODULO_NOME}`
                      : ""}
                </span>
                {!isProvaPhase && currentMaterial ? (
                  <Button
                    text="Tela cheia"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleEnterCollectiveFullscreen()
                    }}
                  />
                ) : null}
              </div>

              {isProvaPhase ? (
                currentProvaStep ? (
                  <div className={styles.trainingProvaArea}>
                    {currentProvaStep.prova.QUESTOES.map((question) => (
                      <article key={question.ID} className={styles.trainingProvaQuestion}>
                        <div className={styles.trainingProvaQuestionHeader}>
                          <strong>Questao {question.ORDEM}</strong>
                          <span>Peso {question.PESO}</span>
                        </div>
                        <p className={styles.trainingProvaQuestionText}>{question.ENUNCIADO}</p>
                        <div className={styles.trainingProvaOptions}>
                          {question.OPCOES.map((option) => {
                            const checked = currentProvaAnswers[question.ID] === option.ID
                            const gabaritoItem = currentProvaResult?.gabarito.find(
                              (item) => item.questaoId === question.ID,
                            )
                            const isCorrectOption =
                              Boolean(currentProvaResult) &&
                              gabaritoItem?.opcaoCorretaId === option.ID
                            const isMarkedWrong =
                              Boolean(currentProvaResult) &&
                              gabaritoItem?.opcaoMarcadaId === option.ID &&
                              !gabaritoItem?.acertou

                            return (
                              <label
                                key={option.ID}
                                className={`${styles.trainingProvaOption} ${
                                  isCorrectOption ? styles.trainingProvaOptionCorrect : ""
                                } ${isMarkedWrong ? styles.trainingProvaOptionWrong : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={`collective-question-${question.ID}`}
                                  checked={checked}
                                  disabled={Boolean(currentProvaResult)}
                                  onChange={() =>
                                    handleSelectCollectiveAnswer(question.ID, option.ID)
                                  }
                                />
                                <span>{option.TEXTO}</span>
                              </label>
                            )
                          })}
                        </div>
                      </article>
                    ))}

                    {provaErrorMessage ? (
                      <p className={styles.trainingProvaError}>{provaErrorMessage}</p>
                    ) : null}

                    {currentProvaResult ? (
                      <div className={styles.trainingProvaResult}>
                        <strong>
                          Nota {currentProvaResult.nota.toFixed(2)} / 10 -{" "}
                          {currentProvaResult.aprovado ? "Aprovado" : "Reprovado"}
                        </strong>
                        <span>
                          Resultado aplicado para {currentProvaResult.usuariosAvaliados}{" "}
                          colaboradores.
                        </span>
                      </div>
                    ) : null}

                    <div className={styles.trainingProvaActions}>
                      {!currentProvaResult ? (
                        <Button
                          text="Enviar Prova Coletiva"
                          onClick={() => {
                            void handleSubmitCollectiveProva()
                          }}
                          disabled={!canSubmitCurrentProva || isSubmittingProva}
                          isLoading={isSubmittingProva}
                        />
                      ) : (
                        <>
                          <Button
                            text="Reaplicar Prova"
                            variant="ghost"
                            onClick={handleRetryCurrentProva}
                          />
                          <Button text="Fechar" onClick={handleCloseOrderModal} />
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.trainingPlayerPlaceholder}>
                    Nenhuma prova encontrada para as trilhas selecionadas.
                  </div>
                )
              ) : (
                currentMaterial ? (
                  <div ref={instructorMediaRef} className={styles.trainingMediaWrapper}>
                    {getYouTubeId(currentMaterial.PATH_VIDEO ?? "") ? (
                      <QueuePlayer
                        video={currentMaterial.PATH_VIDEO ?? ""}
                        title={currentMaterial.TITULO}
                        autoplay={isTrainingStarted}
                        onEnded={
                          isTrainingStarted
                            ? () => {
                                void advanceToNextMaterial()
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <video
                        key={`${currentMaterial.id}-${currentMaterial.VERSAO}`}
                        className={styles.trainingVideo}
                        controls
                        autoPlay={isTrainingStarted}
                        preload="metadata"
                        src={resolveAssetUrl(currentMaterial.PATH_VIDEO ?? "")}
                        onEnded={
                          isTrainingStarted
                            ? () => {
                                void advanceToNextMaterial()
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                ) : (
                  <div className={styles.trainingPlayerPlaceholder}>
                    Selecione um video para iniciar.
                  </div>
                )
              )}

              {!isTrainingStarted && !isProvaPhase ? (
                <p className={styles.trainingQueueMeta}>
                  Use a fila da direita para ordenar e clique em Iniciar Treinamento.
                </p>
              ) : null}
              {collectiveSummaryMessage ? (
                <p className={styles.trainingVideoDone}>{collectiveSummaryMessage}</p>
              ) : null}
            </div>

            <div className={styles.trainingQueuePanel}>
              <div className={styles.trainingQueueHeader}>
                <h4>{isProvaPhase ? "Fila de provas" : "Fila de videos"}</h4>
                <span className={styles.trainingQueueCount}>
                  {isProvaPhase ? collectiveProvas.length : orderedMaterials.length}
                </span>
              </div>

              {isProvaPhase ? (
                collectiveProvas.length ? (
                  <ul className={styles.trainingQueueList}>
                    {collectiveProvas.map((step, index) => {
                      const result = collectiveResults[step.trilhaId]
                      const isActive = index === currentProvaIndex
                      return (
                        <li
                          key={`${step.trilhaId}-${step.prova.VERSAO}`}
                          className={`${styles.trainingQueueItem} ${
                            isActive ? styles.trainingQueueActive : ""
                          }`}
                        >
                          <button
                            type="button"
                            className={styles.trainingQueueButton}
                            onClick={() => {
                              setCurrentProvaIndex(index)
                              setProvaErrorMessage(null)
                            }}
                          >
                            <div className={styles.trainingQueueInfo}>
                              <span
                                className={`${styles.trainingQueueTypeBadge} ${
                                  result
                                    ? result.aprovado
                                      ? styles.trainingQueueTypeDone
                                      : styles.trainingQueueTypePdf
                                    : styles.trainingQueueTypeVideo
                                }`}
                              >
                                {result ? (result.aprovado ? "Aprovado" : "Reprovado") : "Pendente"}
                              </span>
                              <span className={styles.trainingQueueTitle}>{step.trilhaTitulo}</span>
                              <span className={styles.trainingQueueMeta}>
                                {step.prova.QUESTOES.length} questoes
                              </span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className={styles.trainingQueueEmpty}>Nenhuma prova na fila.</div>
                )
              ) : (
                orderedMaterials.length ? (
                  <ul className={styles.trainingQueueList}>
                    {orderedMaterials.map((material) => {
                      const isActive = material.id === currentMaterialId
                      const isDragging = material.id === draggedMaterialId
                      const isDropTarget = material.id === dropTargetMaterialId
                      return (
                        <li
                          key={material.id}
                          draggable={!isQueueInteractionBlocked}
                          onDragStart={() => {
                            setDraggedMaterialId(material.id)
                            setDropTargetMaterialId(null)
                          }}
                          onDragOver={(event) => {
                            if (!draggedMaterialId || draggedMaterialId === material.id) {
                              return
                            }
                            event.preventDefault()
                            setDropTargetMaterialId(material.id)
                          }}
                          onDragLeave={() => {
                            if (dropTargetMaterialId === material.id) {
                              setDropTargetMaterialId(null)
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            if (
                              draggedMaterialId &&
                              draggedMaterialId !== material.id &&
                              !isQueueInteractionBlocked
                            ) {
                              moveMaterial(draggedMaterialId, material.id)
                            }
                            setDraggedMaterialId(null)
                            setDropTargetMaterialId(null)
                          }}
                          onDragEnd={() => {
                            setDraggedMaterialId(null)
                            setDropTargetMaterialId(null)
                          }}
                          className={`${styles.trainingQueueItem} ${
                            isActive ? styles.trainingQueueActive : ""
                          } ${isDragging ? styles.trainingQueueDragging : ""} ${
                            isDropTarget ? styles.trainingQueueDropTarget : ""
                          }`}
                        >
                          <button
                            type="button"
                            className={styles.trainingQueueButton}
                            onClick={() => setCurrentMaterialId(material.id)}
                          >
                            <div className={styles.trainingQueueInfo}>
                              <span
                                className={`${styles.trainingQueueTypeBadge} ${styles.trainingQueueTypeVideo}`}
                              >
                                Video
                              </span>
                              <span className={styles.trainingQueueTitle}>{material.TITULO}</span>
                              <span className={styles.trainingQueueMeta}>
                                {material.TRILHA_TITULO} - {material.MODULO_NOME}
                              </span>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className={styles.trainingQueueEmpty}>Nenhum video selecionado.</div>
                )
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={isCollectiveEvidenceModalOpen}
        onClose={() => undefined}
        size="lg"
        title="Encerramento do treinamento coletivo"
        showClose={false}
      >
        <div className={styles.trainingEvidenceModal}>
          <p className={styles.trainingEficacyQuestion}>
            Informe a <strong>duracao do treinamento</strong> e envie as{" "}
            <strong>fotos de evidencia</strong> para finalizar o encerramento.
          </p>
          <p className={styles.trainingEficacyHint}>
            Envie uma ou mais fotos tiradas durante o treinamento coletivo.
          </p>

          <div className={styles.trainingEvidenceDurationRow}>
            <label className={styles.trainingEvidenceField}>
              <span>Horas</span>
              <select
                className={styles.trainingEfficacySelect}
                value={String(collectiveDurationHours)}
                onChange={(event) => {
                  setCollectiveDurationHours(Number(event.target.value) || 0)
                  setCollectiveEvidenceError(null)
                }}
              >
                {Array.from({ length: 25 }, (_, index) => (
                  <option key={`duracao-horas-${index}`} value={index}>
                    {index}h
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.trainingEvidenceField}>
              <span>Minutos</span>
              <select
                className={styles.trainingEfficacySelect}
                value={String(collectiveDurationMinutes)}
                onChange={(event) => {
                  setCollectiveDurationMinutes(Number(event.target.value) || 0)
                  setCollectiveEvidenceError(null)
                }}
              >
                {[0, 15, 30, 45].map((minutes) => (
                  <option key={`duracao-min-${minutes}`} value={minutes}>
                    {String(minutes).padStart(2, "0")} min
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.trainingEvidenceUploadBox}>
            <label htmlFor="collective-training-evidence" className={styles.trainingEvidenceUploadLabel}>
              Fotos de evidencia (multiplas imagens)
            </label>
            <input
              id="collective-training-evidence"
              ref={evidenceInputRef}
              className={styles.trainingEvidenceFileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={handleCollectiveEvidenceFilesChange}
            />

            {collectiveEvidenceFiles.length > 0 ? (
              <ul className={styles.trainingEvidenceFileList}>
                {collectiveEvidenceFiles.map((file, index) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>
                      {index + 1}. {file.name}
                    </span>
                    <button
                      type="button"
                      className={styles.trainingEvidenceRemoveBtn}
                      onClick={() => handleRemoveCollectiveEvidenceFile(index)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.trainingEficacyHint}>Nenhuma foto selecionada.</p>
            )}
          </div>

          {collectiveEvidenceError ? (
            <p className={styles.trainingProvaError}>{collectiveEvidenceError}</p>
          ) : null}
          {collectiveQrError ? (
            <p className={styles.trainingProvaError}>{collectiveQrError}</p>
          ) : null}

          <div className={styles.trainingProvaActions}>
            <Button
              text="Salvar evidencias e continuar"
              onClick={() => {
                void handleSubmitCollectiveEvidence()
              }}
              isLoading={isSubmittingCollectiveEvidence}
              disabled={!canSubmitCollectiveEvidence || isSubmittingCollectiveEvidence}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={isQrModalOpen}
        onClose={() => {
          if (isGeneratingQr) return
          setIsQrModalOpen(false)
        }}
        size="md"
        title="QR Code - Prova Individual"
      >
        <div className={styles.trainingEficacyModal}>
          <p className={styles.trainingEficacyQuestion}>
            Peça para cada participante ler este QR Code e responder a prova individual no celular.
          </p>
          <p className={styles.trainingEficacyHint}>
            O link expira em {collectiveQrState?.expiresAt ? new Date(collectiveQrState.expiresAt).toLocaleString("pt-BR") : "-"}.
            Participantes autorizados: {collectiveQrState?.totalUsuarios ?? 0}.
          </p>

          {collectiveQrState?.qrCodeImageUrl ? (
            <div className={styles.trainingQrCodeBox}>
              <img
                src={collectiveQrState.qrCodeImageUrl}
                alt="QR Code para prova individual"
                className={styles.trainingQrCodeImage}
              />
            </div>
          ) : null}

          {collectiveQrState?.redirectUrl ? (
            <div className={styles.trainingProofLinkBox}>
              <input
                className={styles.trainingProofLinkInput}
                type="text"
                value={collectiveQrState.redirectUrl}
                readOnly
              />
              <Button
                text="Copiar link"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(collectiveQrState.redirectUrl)
                    .then(() => setFeedbackMessage("Link da prova individual copiado."))
                    .catch(() => setCollectiveQrError("Nao foi possivel copiar o link."))
                }}
              />
            </div>
          ) : null}

          {collectiveQrError ? (
            <p className={styles.trainingProvaError}>{collectiveQrError}</p>
          ) : null}

          <div className={styles.trainingProvaActions}>
            <Button
              text="Finalizar treinamento"
              onClick={() => {
                setIsQrModalOpen(false)
                handleCloseOrderModal()
              }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={isEfficacyModalOpen}
        onClose={() => undefined}
        size="lg"
        title="Avaliacao de eficacia"
        showClose={false}
      >
        <div className={styles.trainingEficacyModal}>
          <p className={styles.trainingEficacyQuestion}>{TRAINING_EFFICACY_QUESTION}</p>
          <p className={styles.trainingEficacyHint}>
            Responda para cada participante antes de finalizar o treinamento coletivo.
          </p>

          <div className={styles.trainingEfficacyCollectiveList}>
            {efficacyParticipants.map((participant) => (
              <div key={participant.id} className={styles.trainingEfficacyCollectiveRow}>
                <div className={styles.trainingEfficacyParticipantInfo}>
                  <strong>{participant.nome}</strong>
                  <span>{participant.cpf}</span>
                </div>
                <select
                  className={styles.trainingEfficacySelect}
                  value={String(collectiveEfficacyLevels[participant.cpf] ?? "")}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setCollectiveEfficacyLevels((prev) => ({
                      ...prev,
                      [participant.cpf]: Number.isFinite(value) && value > 0 ? value : 0,
                    }))
                    setCollectiveEfficacyError(null)
                  }}
                >
                  <option value="">Selecione a avaliacao</option>
                  {TRAINING_EFFICACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <p className={styles.trainingEfficacyProgress}>
            {collectiveEfficacyAnsweredCount}/{efficacyParticipants.length} participante(s)
            avaliados.
          </p>

          {collectiveEfficacyError ? (
            <p className={styles.trainingProvaError}>{collectiveEfficacyError}</p>
          ) : null}

          <div className={styles.trainingProvaActions}>
            <Button
              text="Salvar avaliacao e finalizar"
              onClick={() => {
                void handleSubmitCollectiveEfficacy()
              }}
              isLoading={isSubmittingEfficacy}
              disabled={!canSubmitCollectiveEfficacy || isSubmittingEfficacy}
            />
          </div>
        </div>
      </Modal>

      <FacialEnrollmentModal
        open={isFaceModalOpen}
        onClose={() => setIsFaceModalOpen(false)}
        participants={faceParticipants}
        instructorCpf={instructorCpf || undefined}
        onCompleted={handleFaceCompleted}
      />
    </>
  )
}

export default Instructor
