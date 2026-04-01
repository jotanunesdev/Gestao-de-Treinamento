import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import styles from "./main.module.css"
import Modal from "../../shared/ui/modal/Modal"
import Button from "../../shared/ui/button/Button"
import FacialEnrollmentModal, {
  type FacialCaptureResult,
} from "../../shared/ui/facial/FacialEnrollmentModal"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import {
  fetchUserTrilhas,
  fetchUserVideos,
  type TrilhaItem,
  type VideoItem,
} from "../../shared/api/trainings"
import {
  buildPdfContentUrl,
  fetchUserPdfs,
  type PdfItem,
} from "../../shared/api/pdfs"
import {
  attachCollectiveTrainingFaceEvidence,
  completePdfTraining,
  completeVideoTraining,
  listCompletedVideoTrainings,
  submitTrilhaTrainingEfficacy,
} from "../../shared/api/userTrainings"
import {
  getPlatformSatisfactionStatus,
  submitPlatformSatisfaction,
} from "../../shared/api/feedbacks"
import {
  fetchEfficacyProvaByTrilha,
  fetchLatestObjectiveProvaResult,
  fetchObjectiveProvaForPlayer,
  resolveCollectiveIndividualProofToken,
  submitObjectiveProvaForPlayer,
  type CollectiveIndividualProofTokenResolveResponse,
  type ObjectiveProvaPlayerRecord,
  type ObjectiveProvaSubmissionResult,
} from "../../shared/api/provas"
import {
  clearLastWatchedProgressByVideo,
  upsertLastWatchedProgress,
} from "../../shared/utils/learningProgress"
import {
  resolveTrainingMaterialBadgeLabel,
  resolveTrainingMaterialDisplayKind,
} from "../../shared/utils/trainingMaterialDisplay"
import {
  TRAINING_EFFICACY_OPTIONS,
  TRAINING_EFFICACY_QUESTION,
} from "../../shared/constants/trainingEfficacy"
import {
  PLATFORM_SATISFACTION_OPTIONS,
  PLATFORM_SATISFACTION_QUESTION,
} from "../../shared/constants/platformSatisfaction"
import {
  readCollectiveProofTokenFromStorage,
  saveCollectiveProofToken,
} from "../../shared/utils/collectiveProofToken"

const assetsBase = (import.meta.env.VITE_PUBLIC_ASSETS_URL ?? "").replace(/\/$/, "")
const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
const fallbackAssetsBase = assetsBase || apiBase

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
      if (typeof window !== "undefined" && window.location.protocol === "https:" && parsed.protocol === "http:") {
        parsed.protocol = "https:"
      }
      parsed.pathname = normalizePathname(parsed.pathname)
      return parsed.toString()
    } catch {
      return trimmed
    }
  }

  const cleanPath = trimmed.replace(/^\/+/, "")
  const [pathname, suffix = ""] = cleanPath.split(/(?=[?#])/, 2)
  const normalizedPath = normalizePathname(pathname)
  const base = fallbackAssetsBase
    ? `${fallbackAssetsBase}/${normalizedPath}`
    : `/${normalizedPath}`
  return `${base}${suffix}`
}

const resolvePdfPreviewUrl = (materialId?: string | null, versao?: number | null, path?: string | null) => {
  const contentUrl = buildPdfContentUrl(materialId ?? "", versao)
  if (contentUrl) {
    return contentUrl
  }

  return resolveAssetUrl(path ?? "")
}

const getYouTubeId = (urlOrId: string) => {
  if (!urlOrId) return null
  let normalized = urlOrId.trim()

  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(normalized)
      if (decoded === normalized) break
      normalized = decoded
    } catch {
      break
    }
  }

  if (/^[a-zA-Z0-9_-]{11}$/.test(normalized)) return normalized

  try {
    const u = new URL(normalized)
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

const buildCompletionKey = (videoId: string, versao?: number | null) =>
  `${videoId}:${versao ?? 0}`

const buildPdfCompletionStorageKey = (cpf: string) => `jnc:training:pdf-completions:${cpf}`

const readPdfCompletionsFromStorage = (cpf: string): Record<string, string> => {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(buildPdfCompletionStorageKey(cpf))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof key !== "string" || typeof value !== "string") return acc
      acc[key] = value
      return acc
    }, {})
  } catch {
    return {}
  }
}

const savePdfCompletionsToStorage = (cpf: string, value: Record<string, string>) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(buildPdfCompletionStorageKey(cpf), JSON.stringify(value))
  } catch {
    // ignore storage errors
  }
}

const findFirstPendingVideo = (
  queue: VideoItem[],
  completedMap: Record<string, string>,
) =>
  queue.find((video) => !completedMap[buildCompletionKey(video.ID, video.VERSAO)]) ?? null

const findFirstPendingPdf = (
  queue: PdfItem[],
  completedMap: Record<string, string>,
) =>
  queue.find((pdf) => !completedMap[buildCompletionKey(pdf.ID, pdf.VERSAO)]) ?? null

const computeStructuredEfficacyLevel = (
  prova: ObjectiveProvaPlayerRecord,
  answers: Record<string, string>,
) => {
  const questions = Array.isArray(prova.QUESTOES) ? prova.QUESTOES : []
  if (!questions.length) {
    return null
  }

  let totalWeight = 0
  let weightedScore = 0

  for (const question of questions) {
    const options = [...(question.OPCOES ?? [])].sort((left, right) => left.ORDEM - right.ORDEM)
    if (!options.length) {
      continue
    }

    const selectedOptionId = answers[question.ID]
    const selectedIndex = options.findIndex((option) => option.ID === selectedOptionId)
    if (selectedIndex < 0) {
      return null
    }

    const weight = Number.isFinite(Number(question.PESO)) && Number(question.PESO) > 0
      ? Number(question.PESO)
      : 1
    const normalizedLevel =
      options.length <= 1
        ? 5
        : 1 + (selectedIndex / (options.length - 1)) * 4

    totalWeight += weight
    weightedScore += normalizedLevel * weight
  }

  if (totalWeight <= 0) {
    return null
  }

  return Math.min(5, Math.max(1, Math.round(weightedScore / totalWeight)))
}

const formatDateTime = (value?: string | null) => {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("pt-BR")
}

const resolveVideoTitle = (pathVideo: string | null) => {
  if (!pathVideo) return "Video"
  try {
    const parsed = new URL(pathVideo)
    const title = parsed.searchParams.get("title")
    if (title) return decodeURIComponent(title)
  } catch {
    // ignore
  }

  const name = pathVideo.split("/").pop() ?? ""
  const noExt = name.replace(/\.[^/.]+$/, "")
  return noExt.replace(/[-_]+/g, " ").trim() || "Video"
}

const resolveDocumentTitle = (pathValue: string | null, fallback = "Arquivo") => {
  if (!pathValue) return fallback
  const name = pathValue.split("/").pop() ?? ""
  const noExt = name.replace(/\.[^/.]+$/, "")
  return noExt.replace(/[-_]+/g, " ").trim() || fallback
}

const resolvePdfTitle = (pathPdf: string | null) => resolveDocumentTitle(pathPdf, "PDF")

type YouTubePlayer = {
  destroy: () => void
}

type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
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

type YouTubeQueuePlayerProps = {
  video: string
  title: string
  onEnded: () => void
}

const YouTubeQueuePlayer = ({ video, title, onEnded }: YouTubeQueuePlayerProps) => {
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
            // ignore
          }
        }

        playerRef.current = new YT.Player(host, {
          videoId: id,
          playerVars: {
            autoplay: 1,
            rel: 0,
          },
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.ENDED) {
                onEnded()
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
          // ignore
        }
        playerRef.current = null
      }
      if (wrapper.isConnected) {
        wrapper.replaceChildren()
      }
    }
  }, [id, onEnded])

  if (!id) {
    return <div className={styles.trainingPlayerPlaceholder}>Video indisponivel.</div>
  }

  return <div ref={wrapperRef} className={styles.trainingPlayerFrame} aria-label={title} />
}

type TrainingsRouteState = {
  focusTraining?: {
    trilhaId: string
    videoId?: string
  }
}

type TokenProofInfo = {
  trilhaId: string
  provaId: string
  provaTitulo: string
  provaVersao: number
}

function buildTokenProofInfo(
  prova:
    | {
        ID: string
        TRILHA_FK_ID: string
        TITULO: string | null
        VERSAO: number
      }
    | null
    | undefined,
): TokenProofInfo | null {
  if (!prova?.ID || !prova?.TRILHA_FK_ID) {
    return null
  }

  return {
    trilhaId: prova.TRILHA_FK_ID,
    provaId: prova.ID,
    provaTitulo: prova.TITULO?.trim() || "Prova individual",
    provaVersao: prova.VERSAO,
  }
}

const TrainingsPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()
  const location = useLocation()
  const navigate = useNavigate()
  const [trilhas, setTrilhas] = useState<TrilhaItem[]>([])
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [pdfs, setPdfs] = useState<PdfItem[]>([])
  const [completedByKey, setCompletedByKey] = useState<Record<string, string>>({})
  const [completedPdfByKey, setCompletedPdfByKey] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false)
  const [activeQueue, setActiveQueue] = useState<VideoItem[]>([])
  const [activeTrilhaTitle, setActiveTrilhaTitle] = useState("")
  const [activeTrilhaId, setActiveTrilhaId] = useState<string | null>(null)
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null)
  const [currentPdfId, setCurrentPdfId] = useState<string | null>(null)
  const [isAwaitingPostContentStep, setIsAwaitingPostContentStep] = useState(false)
  const [playerMessage, setPlayerMessage] = useState<string | null>(null)
  const [objectiveProva, setObjectiveProva] = useState<ObjectiveProvaPlayerRecord | null>(null)
  const [efficacyProva, setEfficacyProva] = useState<ObjectiveProvaPlayerRecord | null>(null)
  const [isObjectiveLoading, setIsObjectiveLoading] = useState(false)
  const [objectiveError, setObjectiveError] = useState<string | null>(null)
  const [isObjectivePhase, setIsObjectivePhase] = useState(false)
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, string>>({})
  const [isSubmittingObjective, setIsSubmittingObjective] = useState(false)
  const [objectiveResult, setObjectiveResult] = useState<ObjectiveProvaSubmissionResult | null>(null)
  const [isEfficacyModalOpen, setIsEfficacyModalOpen] = useState(false)
  const [efficacyLevel, setEfficacyLevel] = useState<number | null>(null)
  const [efficacyAnswers, setEfficacyAnswers] = useState<Record<string, string>>({})
  const [efficacyError, setEfficacyError] = useState<string | null>(null)
  const [isSubmittingEfficacy, setIsSubmittingEfficacy] = useState(false)
  const [pendingEfficacyFinalMessage, setPendingEfficacyFinalMessage] = useState<string | null>(null)
  const [isSatisfactionModalOpen, setIsSatisfactionModalOpen] = useState(false)
  const [satisfactionLevel, setSatisfactionLevel] = useState<number | null>(null)
  const [satisfactionError, setSatisfactionError] = useState<string | null>(null)
  const [isSubmittingSatisfaction, setIsSubmittingSatisfaction] = useState(false)
  const [collectiveProofToken, setCollectiveProofToken] = useState<string | null>(() =>
    readCollectiveProofTokenFromStorage(),
  )
  const [tokenProofContext, setTokenProofContext] =
    useState<CollectiveIndividualProofTokenResolveResponse | null>(null)
  const [isResolvingTokenProof, setIsResolvingTokenProof] = useState(false)
  const [tokenProofError, setTokenProofError] = useState<string | null>(null)
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false)
  const [isSubmittingFaceEvidence, setIsSubmittingFaceEvidence] = useState(false)
  const [faceEvidenceError, setFaceEvidenceError] = useState<string | null>(null)
  const [pendingFaceFinalMessage, setPendingFaceFinalMessage] = useState<string | null>(null)
  const lastProgressSecondRef = useRef(0)
  const playerMediaRef = useRef<HTMLDivElement | null>(null)
  const satisfactionPromptShownRef = useRef(false)
  const autoOpenedTokenRef = useRef<string | null>(null)

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const cpf = useMemo(() => {
    const raw = pfunc?.CPF ?? data?.User?.CPF ?? ""
    return raw.replace(/\D/g, "")
  }, [data?.User?.CPF, pfunc?.CPF])

  useEffect(() => {
    satisfactionPromptShownRef.current = false
  }, [cpf])

  useEffect(() => {
    if (!cpf || cpf.length !== 11) {
      setCompletedPdfByKey({})
      return
    }
    setCompletedPdfByKey(readPdfCompletionsFromStorage(cpf))
  }, [cpf])

  useEffect(() => {
    if (!cpf || cpf.length !== 11) {
      return
    }
    savePdfCompletionsToStorage(cpf, completedPdfByKey)
  }, [completedPdfByKey, cpf])

  const routeState = location.state as TrainingsRouteState | null
  const focusTraining = routeState?.focusTraining ?? null

  const tokenProofsByTrilha = useMemo(() => {
    const map = new Map<string, TokenProofInfo>()
    for (const prova of tokenProofContext?.provas ?? []) {
      const info = buildTokenProofInfo(prova)
      if (info) {
        map.set(prova.TRILHA_FK_ID, info)
      }
    }
    return map
  }, [tokenProofContext?.provas])

  const userPayload = useMemo(() => {
    const source = Array.isArray(data?.PFunc) ? data.PFunc[0] : data?.PFunc
    if (!source || typeof source !== "object") {
      return undefined
    }

    const payload: Record<string, string> = {}
    for (const [key, rawValue] of Object.entries(source)) {
      if (typeof rawValue !== "string") continue
      const trimmed = rawValue.trim()
      if (!trimmed) continue
      payload[key] = trimmed
    }

    if (cpf && !payload.CPF) {
      payload.CPF = cpf
    }

    return payload
  }, [cpf, data?.PFunc])

  useEffect(() => {
    const stored = readCollectiveProofTokenFromStorage()
    if (!stored || stored === collectiveProofToken) return
    setCollectiveProofToken(stored)
  }, [collectiveProofToken])

  useEffect(() => {
    if (!cpf || cpf.length !== 11 || !collectiveProofToken) {
      setTokenProofContext(null)
      setTokenProofError(null)
      return
    }

    let cancelled = false
    setIsResolvingTokenProof(true)
    setTokenProofError(null)

    resolveCollectiveIndividualProofToken(collectiveProofToken, cpf)
      .then((response) => {
        if (cancelled) return
        setTokenProofContext(response)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Erro ao validar token de prova coletiva:", err)
        setTokenProofContext(null)
        setTokenProofError(
          err instanceof Error ? err.message : "Nao foi possivel validar a prova individual.",
        )
        saveCollectiveProofToken(null)
        setCollectiveProofToken(null)
      })
      .finally(() => {
        if (cancelled) return
        setIsResolvingTokenProof(false)
      })

    return () => {
      cancelled = true
    }
  }, [cpf, collectiveProofToken])

  useEffect(() => {
    if (!cpf || cpf.length !== 11) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)
    setPdfs([])

    Promise.allSettled([
      fetchUserTrilhas(cpf),
      fetchUserVideos(cpf),
      fetchUserPdfs(cpf),
      listCompletedVideoTrainings(cpf),
    ])
      .then((results) => {
        if (cancelled) return
        const [trilhasResult, videosResult, pdfsResult, completionsResult] = results

        if (trilhasResult.status === "rejected" || videosResult.status === "rejected") {
          const firstError =
            trilhasResult.status === "rejected"
              ? trilhasResult.reason
              : videosResult.status === "rejected"
                ? videosResult.reason
                : new Error("Erro ao carregar treinamentos")
          throw firstError
        }

        setTrilhas(trilhasResult.value.trilhas ?? [])
        setVideos(videosResult.value.videos ?? [])
        if (pdfsResult.status === "fulfilled") {
          setPdfs(pdfsResult.value.pdfs ?? [])
        } else {
          setPdfs([])
        }

        if (completionsResult.status === "fulfilled") {
          const nextCompleted = (completionsResult.value.completions ?? []).reduce<
            Record<string, string>
          >((acc, completion) => {
            const key = buildCompletionKey(
              completion.MATERIAL_ID,
              completion.MATERIAL_VERSAO,
            )
            acc[key] = completion.DT_CONCLUSAO
            return acc
          }, {})
          setCompletedByKey(nextCompleted)
        } else {
          setCompletedByKey({})
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Erro ao carregar treinamentos")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cpf])

  useEffect(() => {
    if (!isPlayerModalOpen || !activeTrilhaId || !cpf || cpf.length !== 11) {
      return
    }

    let cancelled = false
    setIsObjectiveLoading(true)
    setObjectiveError(null)

    const activeTokenProof = tokenProofsByTrilha.get(activeTrilhaId)
    const tokenToUse =
      activeTokenProof && collectiveProofToken ? collectiveProofToken : undefined

    Promise.all([
      fetchObjectiveProvaForPlayer(activeTrilhaId, cpf, tokenToUse),
      fetchLatestObjectiveProvaResult(activeTrilhaId, cpf),
    ])
      .then(([provaResponse, latestResultResponse]) => {
        if (cancelled) return

        const prova = provaResponse.prova ?? null
        setObjectiveProva(prova)

        const latestResult = latestResultResponse.result
        if (
          prova &&
          latestResult &&
          latestResult.PROVA_ID === prova.ID &&
          latestResult.PROVA_VERSAO === prova.VERSAO &&
          latestResult.STATUS === "aprovado" &&
          typeof latestResult.RESPOSTAS === "object"
        ) {
          const respostasPayload = latestResult.RESPOSTAS as {
            gabarito?: ObjectiveProvaSubmissionResult["gabarito"]
          }

          if (Array.isArray(respostasPayload.gabarito)) {
            setObjectiveResult({
              nota: Number(latestResult.NOTA ?? 0),
              media: 6,
              status: latestResult.STATUS,
              acertos: Number(latestResult.ACERTOS ?? 0),
              totalQuestoes: Number(latestResult.TOTAL_QUESTOES ?? 0),
              aprovado: latestResult.STATUS === "aprovado",
              gabarito: respostasPayload.gabarito,
              prova: {
                id: prova.ID,
                versao: prova.VERSAO,
                titulo: prova.TITULO ?? null,
              },
            })
          }
        } else {
          setObjectiveResult(null)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Erro ao carregar prova objetiva:", err)
        setObjectiveError(
          err instanceof Error ? err.message : "Nao foi possivel carregar a prova objetiva.",
        )
        setObjectiveProva(null)
        setObjectiveResult(null)
      })
      .finally(() => {
        if (cancelled) return
        setIsObjectiveLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeTrilhaId, collectiveProofToken, cpf, isPlayerModalOpen, tokenProofsByTrilha])

  useEffect(() => {
    if (!isPlayerModalOpen || !activeTrilhaId) {
      setEfficacyProva(null)
      return
    }

    let cancelled = false

    fetchEfficacyProvaByTrilha(activeTrilhaId)
      .then((response) => {
        if (cancelled) return
        setEfficacyProva(response.prova ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Erro ao carregar avaliacao de eficacia:", err)
        setEfficacyProva(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeTrilhaId, isPlayerModalOpen])

  const videosByTrilha = useMemo(() => {
    const map = new Map<string, VideoItem[]>()
    for (const video of videos) {
      const list = map.get(video.TRILHA_FK_ID) ?? []
      list.push(video)
      map.set(video.TRILHA_FK_ID, list)
    }

    for (const [key, list] of map.entries()) {
      const ordered = [...list].sort((a, b) => {
        const orderA = a.ORDEM ?? Number.MAX_SAFE_INTEGER
        const orderB = b.ORDEM ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return a.ID.localeCompare(b.ID)
      })
      map.set(key, ordered)
    }

    return map
  }, [videos])

  const pdfsByTrilha = useMemo(() => {
    const map = new Map<string, PdfItem[]>()
    for (const pdf of pdfs) {
      const list = map.get(pdf.TRILHA_FK_ID) ?? []
      list.push(pdf)
      map.set(pdf.TRILHA_FK_ID, list)
    }

    for (const [key, list] of map.entries()) {
      const ordered = [...list].sort((a, b) => a.ID.localeCompare(b.ID))
      map.set(key, ordered)
    }

    return map
  }, [pdfs])

  const trilhaCards = useMemo(
    () => {
      const cards = trilhas.map((trilha) => ({
        trilha,
        videoCount: (videosByTrilha.get(trilha.ID) ?? []).filter(
          (video) =>
            resolveTrainingMaterialDisplayKind(video.PATH_VIDEO, video.TIPO_CONTEUDO) === "video",
        ).length,
        documentCount:
          (videosByTrilha.get(trilha.ID) ?? []).filter(
            (video) =>
              resolveTrainingMaterialDisplayKind(video.PATH_VIDEO, video.TIPO_CONTEUDO) !==
              "video",
          ).length + (pdfsByTrilha.get(trilha.ID) ?? []).length,
        tokenProof: tokenProofsByTrilha.get(trilha.ID) ?? null,
      }))

      for (const tokenProof of tokenProofsByTrilha.values()) {
        if (cards.some((item) => item.trilha.ID === tokenProof.trilhaId)) {
          continue
        }

        cards.push({
          trilha: {
            ID: tokenProof.trilhaId,
            MODULO_FK_ID: "__token__",
            TITULO: `Prova Individual - ${tokenProof.provaTitulo}`,
          },
          videoCount: 0,
          documentCount: 0,
          tokenProof,
        })
      }

      return cards
    },
    [pdfsByTrilha, tokenProofsByTrilha, trilhas, videosByTrilha],
  )

  const maybePromptPlatformSatisfaction = useCallback(async () => {
    if (!cpf || cpf.length !== 11 || satisfactionPromptShownRef.current) {
      return
    }

    try {
      const status = await getPlatformSatisfactionStatus(cpf)
      if (!status.deveExibir) {
        return
      }

      setSatisfactionLevel(null)
      setSatisfactionError(null)
      setIsSatisfactionModalOpen(true)
      satisfactionPromptShownRef.current = true
    } catch (err) {
      console.error("Erro ao consultar pesquisa de satisfacao:", err)
    }
  }, [cpf])

  const handleCompleteVideo = useCallback(async (video: VideoItem) => {
    if (!cpf || cpf.length !== 11) return null
    const key = buildCompletionKey(video.ID, video.VERSAO)
    if (completedByKey[key]) return completedByKey[key]

    try {
      const result = await completeVideoTraining({
        cpf,
        videoId: video.ID,
        materialVersao: video.VERSAO,
        origem: "player",
        user: userPayload,
      })

      setCompletedByKey((prev) => ({
        ...prev,
        [key]: result.completedAt,
      }))
      clearLastWatchedProgressByVideo(cpf, video.ID, video.VERSAO)
      void maybePromptPlatformSatisfaction()

      return result.completedAt
    } catch (err) {
      console.error("Erro ao registrar conclusao do video:", err)
      return null
    }
  }, [completedByKey, cpf, maybePromptPlatformSatisfaction, userPayload])

  const openTrilhaPlayer = useCallback((
    trilha: TrilhaItem,
    preferredVideoId?: string | null,
    tokenProof?: TokenProofInfo | null,
  ) => {
    const trilhaVideos = videosByTrilha.get(trilha.ID) ?? []
    const trilhaPdfs = pdfsByTrilha.get(trilha.ID) ?? []
    if (trilhaVideos.length === 0 && trilhaPdfs.length === 0 && !tokenProof) {
      return
    }

    const firstPending = findFirstPendingVideo(trilhaVideos, completedByKey) ?? trilhaVideos[0]
    const firstPendingPdf = findFirstPendingPdf(trilhaPdfs, completedPdfByKey)
    const preferredVideo = preferredVideoId
      ? trilhaVideos.find((video) => video.ID === preferredVideoId) ?? null
      : null

    const canUsePreferred = preferredVideo
      ? !completedByKey[buildCompletionKey(preferredVideo.ID, preferredVideo.VERSAO)]
      : false

    const startVideo = canUsePreferred && preferredVideo ? preferredVideo : firstPending

    const shouldOpenTokenProofDirectly =
      Boolean(tokenProof) && trilhaVideos.length === 0 && !firstPendingPdf
    const shouldResumePostContentStep =
      !shouldOpenTokenProofDirectly &&
      !startVideo &&
      !firstPendingPdf &&
      (trilhaVideos.length > 0 || trilhaPdfs.length > 0)

    setActiveQueue(trilhaVideos)
    setActiveTrilhaTitle(trilha.TITULO)
    setActiveTrilhaId(trilha.ID)
    setCurrentVideoId(startVideo?.ID ?? null)
    setCurrentPdfId(startVideo ? null : (firstPendingPdf?.ID ?? null))
    setIsAwaitingPostContentStep(shouldResumePostContentStep)
    setPlayerMessage(
      shouldOpenTokenProofDirectly
        ? "Prova individual liberada via QR Code. Responda para concluir."
        : null,
    )
    setIsObjectivePhase(shouldOpenTokenProofDirectly)
    setObjectiveAnswers({})
    setObjectiveError(null)
    setObjectiveResult(null)
    setIsEfficacyModalOpen(false)
    setEfficacyLevel(null)
    setEfficacyAnswers({})
    setEfficacyError(null)
    setIsSubmittingEfficacy(false)
    setPendingEfficacyFinalMessage(null)
    setIsPlayerModalOpen(true)
  }, [completedByKey, completedPdfByKey, pdfsByTrilha, videosByTrilha])

  const closeTrilhaPlayer = () => {
    setIsPlayerModalOpen(false)
    setActiveQueue([])
    setActiveTrilhaTitle("")
    setActiveTrilhaId(null)
    setCurrentVideoId(null)
    setCurrentPdfId(null)
    setIsAwaitingPostContentStep(false)
    setPlayerMessage(null)
    setObjectiveProva(null)
    setIsObjectivePhase(false)
    setObjectiveAnswers({})
    setObjectiveResult(null)
    setObjectiveError(null)
    setIsEfficacyModalOpen(false)
    setEfficacyLevel(null)
    setEfficacyAnswers({})
    setEfficacyError(null)
    setIsSubmittingEfficacy(false)
    setPendingEfficacyFinalMessage(null)
    setEfficacyProva(null)
    setIsFaceModalOpen(false)
    setIsSubmittingFaceEvidence(false)
    setFaceEvidenceError(null)
    setPendingFaceFinalMessage(null)
  }

  const openTrilhaEfficacyModal = useCallback((finalMessage: string) => {
    const activeTrilhaIdValue = activeTrilhaId ?? ""
    const isTokenFlow =
      Boolean(collectiveProofToken) &&
      Boolean(activeTrilhaIdValue) &&
      tokenProofsByTrilha.has(activeTrilhaIdValue)
    const hasStructuredEfficacy = Boolean(efficacyProva?.QUESTOES?.length)
    const activeTrilha = trilhas.find((item) => item.ID === activeTrilhaId)
    const required =
      isTokenFlow ||
      hasStructuredEfficacy ||
      activeTrilha?.AVALIACAO_EFICACIA_OBRIGATORIA === true ||
      Number(activeTrilha?.AVALIACAO_EFICACIA_OBRIGATORIA ?? 0) === 1
    const hasQuestion =
      isTokenFlow ||
      hasStructuredEfficacy ||
      String(activeTrilha?.AVALIACAO_EFICACIA_PERGUNTA ?? "").trim().length > 0
    if (!(required && hasQuestion)) {
      setPendingEfficacyFinalMessage(null)
      setEfficacyLevel(null)
      setEfficacyAnswers({})
      setEfficacyError(null)
      setIsEfficacyModalOpen(false)
      setPlayerMessage(finalMessage)
      return
    }
    setPendingEfficacyFinalMessage(finalMessage)
    setEfficacyLevel(null)
    setEfficacyAnswers({})
    setEfficacyError(null)
    setIsEfficacyModalOpen(true)
  }, [activeTrilhaId, collectiveProofToken, efficacyProva, tokenProofsByTrilha, trilhas])

  const currentVideo = useMemo(() => {
    if (!currentVideoId) return null
    return activeQueue.find((item) => item.ID === currentVideoId) ?? null
  }, [activeQueue, currentVideoId])

  const currentVideoDisplayKind = useMemo(
    () =>
      resolveTrainingMaterialDisplayKind(currentVideo?.PATH_VIDEO, currentVideo?.TIPO_CONTEUDO),
    [currentVideo],
  )

  const currentVideoBadgeLabel = useMemo(
    () => resolveTrainingMaterialBadgeLabel(currentVideo?.PATH_VIDEO, currentVideo?.TIPO_CONTEUDO),
    [currentVideo],
  )

  const activeTrilhaPdfs = useMemo(() => {
    if (!activeTrilhaId) return []
    return pdfsByTrilha.get(activeTrilhaId) ?? []
  }, [activeTrilhaId, pdfsByTrilha])

  const isActiveTokenProofFlow = useMemo(() => {
    if (!activeTrilhaId) return false
    return Boolean(collectiveProofToken) && tokenProofsByTrilha.has(activeTrilhaId)
  }, [activeTrilhaId, collectiveProofToken, tokenProofsByTrilha])

  const isTokenProofWithoutMaterials = useMemo(
    () => isActiveTokenProofFlow && activeQueue.length === 0 && activeTrilhaPdfs.length === 0,
    [activeQueue.length, activeTrilhaPdfs.length, isActiveTokenProofFlow],
  )

  useEffect(() => {
    if (!isPlayerModalOpen || isObjectiveLoading || isTokenProofWithoutMaterials) {
      return
    }

    const pendingVideo = findFirstPendingVideo(activeQueue, completedByKey)
    const pendingPdf = findFirstPendingPdf(activeTrilhaPdfs, completedPdfByKey)
    const shouldAdvance = isAwaitingPostContentStep || (!pendingVideo && !pendingPdf)

    if (!shouldAdvance) {
      return
    }

    setIsAwaitingPostContentStep(false)

    if (objectiveProva) {
      setCurrentVideoId(null)
      setCurrentPdfId(null)
      setIsObjectivePhase(true)
      setPlayerMessage("Materiais concluidos. Responda a prova objetiva para finalizar a trilha.")
      return
    }

    openTrilhaEfficacyModal("Trilha concluida. Todos os materiais foram finalizados.")
  }, [
    activeQueue,
    activeTrilhaPdfs,
    completedByKey,
    completedPdfByKey,
    isAwaitingPostContentStep,
    isObjectiveLoading,
    isTokenProofWithoutMaterials,
    isPlayerModalOpen,
    objectiveProva,
    openTrilhaEfficacyModal,
  ])

  const activeTrilhaRecord = useMemo(() => {
    if (!activeTrilhaId) return null
    return trilhas.find((item) => item.ID === activeTrilhaId) ?? null
  }, [activeTrilhaId, trilhas])

  const activeTrilhaEfficacyQuestion = useMemo(() => {
    const configured = String(activeTrilhaRecord?.AVALIACAO_EFICACIA_PERGUNTA ?? "").trim()
    return configured || TRAINING_EFFICACY_QUESTION
  }, [activeTrilhaRecord])

  const hasStructuredEfficacyProva = useMemo(
    () => Boolean(efficacyProva?.QUESTOES?.length),
    [efficacyProva],
  )

  const structuredEfficacyTitle = useMemo(
    () => String(efficacyProva?.TITULO ?? "").trim(),
    [efficacyProva],
  )

  const structuredEfficacyAnsweredCount = useMemo(
    () =>
      (efficacyProva?.QUESTOES ?? []).filter((question) => Boolean(efficacyAnswers[question.ID])).length,
    [efficacyAnswers, efficacyProva],
  )

  const currentPdf = useMemo(() => {
    if (!currentPdfId) return null
    return activeTrilhaPdfs.find((item) => item.ID === currentPdfId) ?? null
  }, [activeTrilhaPdfs, currentPdfId])

  const completedPdfsInTrilha = useMemo(
    () =>
      activeTrilhaPdfs.filter((pdf) => completedPdfByKey[buildCompletionKey(pdf.ID, pdf.VERSAO)])
        .length,
    [activeTrilhaPdfs, completedPdfByKey],
  )

  const totalMaterialsInTrilha = useMemo(
    () => activeQueue.length + activeTrilhaPdfs.length,
    [activeQueue.length, activeTrilhaPdfs.length],
  )

  useEffect(() => {
    if (!focusTraining || isPlayerModalOpen) {
      return
    }

    const trilha =
      trilhas.find((item) => item.ID === focusTraining.trilhaId) ??
      ({
        ID: focusTraining.trilhaId,
        MODULO_FK_ID: "__token__",
        TITULO:
          tokenProofsByTrilha.get(focusTraining.trilhaId)?.provaTitulo ??
          "Prova individual",
      } as TrilhaItem)
    if (!trilha) {
      return
    }

    openTrilhaPlayer(
      trilha,
      focusTraining.videoId,
      tokenProofsByTrilha.get(focusTraining.trilhaId) ?? null,
    )
    navigate(location.pathname, { replace: true, state: null })
  }, [
    focusTraining,
    isPlayerModalOpen,
    tokenProofsByTrilha,
    trilhas,
    openTrilhaPlayer,
    navigate,
    location.pathname,
  ])

  useEffect(() => {
    if (!collectiveProofToken || !tokenProofContext?.provas?.length || isPlayerModalOpen) {
      if (!collectiveProofToken) {
        autoOpenedTokenRef.current = null
      }
      return
    }

    if (autoOpenedTokenRef.current === collectiveProofToken) {
      return
    }

    const firstProof = tokenProofContext.provas[0]
    const tokenProof = tokenProofsByTrilha.get(firstProof.TRILHA_FK_ID) ?? null
    const trilha =
      trilhas.find((item) => item.ID === firstProof.TRILHA_FK_ID) ??
      ({
        ID: firstProof.TRILHA_FK_ID,
        MODULO_FK_ID: "__token__",
        TITULO: tokenProof?.provaTitulo ?? "Prova individual",
      } as TrilhaItem)

    autoOpenedTokenRef.current = collectiveProofToken
    openTrilhaPlayer(trilha, null, tokenProof)
  }, [
    collectiveProofToken,
    isPlayerModalOpen,
    openTrilhaPlayer,
    tokenProofContext?.provas,
    tokenProofsByTrilha,
    trilhas,
  ])

  useEffect(() => {
    lastProgressSecondRef.current = 0
  }, [currentVideoId])

  useEffect(() => {
    if (!isPlayerModalOpen || !currentVideo || !activeTrilhaId || isObjectivePhase) {
      return
    }
    if (!cpf || cpf.length !== 11) {
      return
    }

    const key = buildCompletionKey(currentVideo.ID, currentVideo.VERSAO)
    if (completedByKey[key]) {
      return
    }

    upsertLastWatchedProgress(cpf, {
      videoId: currentVideo.ID,
      videoVersao: currentVideo.VERSAO ?? 1,
      trilhaId: activeTrilhaId,
      pathVideo: currentVideo.PATH_VIDEO,
      titulo: resolveVideoTitle(currentVideo.PATH_VIDEO),
      currentTimeSec: null,
      durationSec: currentVideo.DURACAO_SEGUNDOS ?? null,
    })
  }, [activeTrilhaId, completedByKey, cpf, currentVideo, isObjectivePhase, isPlayerModalOpen])

  const currentVideoIndex = useMemo(() => {
    if (!currentVideo) return -1
    return activeQueue.findIndex((item) => item.ID === currentVideo.ID)
  }, [activeQueue, currentVideo])

  const completedInQueue = useMemo(() => {
    return activeQueue.filter((video) => completedByKey[buildCompletionKey(video.ID, video.VERSAO)]).length
  }, [activeQueue, completedByKey])

  const completedMaterialsInTrilha = useMemo(
    () => completedInQueue + completedPdfsInTrilha,
    [completedInQueue, completedPdfsInTrilha],
  )

  const handleHtmlVideoTimeUpdate = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    if (!isPlayerModalOpen || isObjectivePhase || !currentVideo || !activeTrilhaId) {
      return
    }
    if (!cpf || cpf.length !== 11) {
      return
    }

    const key = buildCompletionKey(currentVideo.ID, currentVideo.VERSAO)
    if (completedByKey[key]) {
      return
    }

    const player = event.currentTarget
    const currentTimeSec = Math.floor(player.currentTime ?? 0)
    if (currentTimeSec <= 0) {
      return
    }

    if (currentTimeSec - lastProgressSecondRef.current < 10) {
      return
    }

    lastProgressSecondRef.current = currentTimeSec
    const durationSec =
      Number.isFinite(player.duration) && player.duration > 0
        ? Math.floor(player.duration)
        : currentVideo.DURACAO_SEGUNDOS ?? null

    upsertLastWatchedProgress(cpf, {
      videoId: currentVideo.ID,
      videoVersao: currentVideo.VERSAO ?? 1,
      trilhaId: activeTrilhaId,
      pathVideo: currentVideo.PATH_VIDEO,
      titulo: resolveVideoTitle(currentVideo.PATH_VIDEO),
      currentTimeSec,
      durationSec,
    })
  }, [
    activeTrilhaId,
    completedByKey,
    cpf,
    currentVideo,
    isObjectivePhase,
    isPlayerModalOpen,
  ])

  const moveToPostContentStep = useCallback(() => {
    setCurrentVideoId(null)
    setCurrentPdfId(null)

    if (isObjectiveLoading) {
      setIsAwaitingPostContentStep(true)
      setIsObjectivePhase(false)
      setPlayerMessage("Carregando prova objetiva. Aguarde um instante.")
      return
    }

    if (objectiveProva) {
      setIsAwaitingPostContentStep(false)
      setIsObjectivePhase(true)
      setPlayerMessage("Materiais concluidos. Responda a prova objetiva para finalizar a trilha.")
      return
    }

    setIsAwaitingPostContentStep(false)
    openTrilhaEfficacyModal("Trilha concluida. Todos os materiais foram finalizados.")
  }, [isObjectiveLoading, objectiveProva, openTrilhaEfficacyModal])

  const handleCompletePdf = useCallback(async (pdf: PdfItem) => {
    if (!cpf || cpf.length !== 11) return null

    const key = buildCompletionKey(pdf.ID, pdf.VERSAO)
    if (completedPdfByKey[key]) {
      return completedPdfByKey[key]
    }

    const completedAt = new Date().toISOString()

    try {
      await completePdfTraining({
        cpf,
        pdfId: pdf.ID,
        materialVersao: pdf.VERSAO,
        concluidoEm: completedAt,
        origem: "player-pdf",
        user: userPayload,
      })
      setCompletedPdfByKey((prev) => ({
        ...prev,
        [key]: completedAt,
      }))
      return completedAt
    } catch (err) {
      console.error("Erro ao registrar conclusao do PDF:", err)
      setPlayerMessage("Nao foi possivel registrar a conclusao do PDF. Tente novamente.")
      return null
    }
  }, [completedPdfByKey, cpf, userPayload])

  const advanceToNextVideo = useCallback(async () => {
    if (!currentVideo || currentVideoIndex < 0) return

    const snapshot = { ...completedByKey }
    const currentKey = buildCompletionKey(currentVideo.ID, currentVideo.VERSAO)

    if (!snapshot[currentKey]) {
      const completedAt = await handleCompleteVideo(currentVideo)
      if (completedAt) {
        snapshot[currentKey] = completedAt
      }
    }

    const pendingVideo = findFirstPendingVideo(activeQueue, snapshot)
    if (pendingVideo) {
      setCurrentVideoId(pendingVideo.ID)
      setCurrentPdfId(null)
      setPlayerMessage(null)
      setIsObjectivePhase(false)
      return
    }

    const pendingPdf = findFirstPendingPdf(activeTrilhaPdfs, completedPdfByKey)
    if (pendingPdf) {
      setCurrentVideoId(null)
      setCurrentPdfId(pendingPdf.ID)
      setPlayerMessage("Videos concluidos. Conclua os PDFs para continuar.")
      setIsObjectivePhase(false)
      return
    }

    moveToPostContentStep()
  }, [
    activeQueue,
    activeTrilhaPdfs,
    completedByKey,
    completedPdfByKey,
    currentVideo,
    currentVideoIndex,
    handleCompleteVideo,
    moveToPostContentStep,
  ])

  const handleCompleteCurrentPdf = useCallback(async () => {
    if (!currentPdf) return

    const snapshot = { ...completedPdfByKey }
    const currentKey = buildCompletionKey(currentPdf.ID, currentPdf.VERSAO)

    if (!snapshot[currentKey]) {
      const completedAt = await handleCompletePdf(currentPdf)
      if (!completedAt) return
      snapshot[currentKey] = completedAt
    }

    const pendingVideo = findFirstPendingVideo(activeQueue, completedByKey)
    if (pendingVideo) {
      setCurrentVideoId(pendingVideo.ID)
      setCurrentPdfId(null)
      setPlayerMessage("PDF concluido. Continue com os videos da trilha.")
      setIsObjectivePhase(false)
      return
    }

    const pendingPdf = findFirstPendingPdf(activeTrilhaPdfs, snapshot)
    if (pendingPdf) {
      setCurrentVideoId(null)
      setCurrentPdfId(pendingPdf.ID)
      setPlayerMessage("PDF concluido. Continue para o proximo documento.")
      setIsObjectivePhase(false)
      return
    }

    moveToPostContentStep()
  }, [
    activeQueue,
    activeTrilhaPdfs,
    completedByKey,
    completedPdfByKey,
    currentPdf,
    handleCompletePdf,
    moveToPostContentStep,
  ])

  const answeredCount = useMemo(() => {
    if (!objectiveProva) return 0
    return objectiveProva.QUESTOES.filter((question) => Boolean(objectiveAnswers[question.ID])).length
  }, [objectiveAnswers, objectiveProva])

  const totalQuestions = objectiveProva?.QUESTOES.length ?? 0

  const handleSelectObjectiveAnswer = useCallback((questaoId: string, opcaoId: string) => {
    setObjectiveAnswers((prev) => ({
      ...prev,
      [questaoId]: opcaoId,
    }))
  }, [])

  const handleSubmitObjective = useCallback(async () => {
    if (!objectiveProva || !activeTrilhaId || !cpf || cpf.length !== 11) {
      return
    }

    const unanswered = objectiveProva.QUESTOES.filter((question) => !objectiveAnswers[question.ID])
    if (unanswered.length > 0) {
      setObjectiveError("Responda todas as questoes antes de enviar a prova.")
      return
    }

    try {
      setIsSubmittingObjective(true)
      setObjectiveError(null)
      const respostas = objectiveProva.QUESTOES.map((question) => ({
        questaoId: question.ID,
        opcaoId: objectiveAnswers[question.ID],
      }))
      const activeTokenProof = tokenProofsByTrilha.get(activeTrilhaId)
      const tokenToUse =
        activeTokenProof && collectiveProofToken ? collectiveProofToken : undefined

      const result = await submitObjectiveProvaForPlayer({
        trilhaId: activeTrilhaId,
        cpf,
        respostas,
        user: userPayload,
        token: tokenToUse,
      })
      setObjectiveResult(result)
      if (result.aprovado) {
        if (tokenToUse) {
          openTrilhaEfficacyModal(
            "Prova concluida com sucesso. Realize agora a avaliacao de eficacia para continuar.",
          )
        } else {
          openTrilhaEfficacyModal(
            "Prova concluida com sucesso. Voce foi aprovado e a trilha foi finalizada.",
          )
        }
      } else {
        setPlayerMessage("Prova concluida. Voce foi reprovado e pode tentar novamente.")
      }
    } catch (err) {
      console.error("Erro ao enviar prova objetiva:", err)
      setObjectiveError(err instanceof Error ? err.message : "Nao foi possivel enviar a prova.")
    } finally {
      setIsSubmittingObjective(false)
    }
  }, [
    activeTrilhaId,
    collectiveProofToken,
    cpf,
    objectiveAnswers,
    objectiveProva,
    openTrilhaEfficacyModal,
    tokenProofsByTrilha,
    userPayload,
  ])

  const selfFaceParticipants = useMemo(() => {
    if (!cpf || cpf.length !== 11) return []
    const fallbackName =
      (Array.isArray(data?.PFunc) ? data.PFunc[0]?.NOME : data?.PFunc?.NOME) ||
      "Colaborador"
    return [
      {
        id: cpf,
        cpf,
        nome: String(fallbackName).trim() || "Colaborador",
        raw: {
          ...(userPayload ?? {}),
          CPF: cpf,
          NOME: String(fallbackName).trim() || "Colaborador",
        },
      },
    ]
  }, [cpf, data?.PFunc, userPayload])

  const handleFaceCompleted = useCallback(
    async (captures: FacialCaptureResult[]) => {
      setIsFaceModalOpen(false)
      const activeTrilhaIdValue = activeTrilhaId ?? ""
      const turmaId = tokenProofContext?.turmaId
      const isTokenFlow =
        Boolean(collectiveProofToken) &&
        Boolean(activeTrilhaIdValue) &&
        tokenProofsByTrilha.has(activeTrilhaIdValue)
      const finishTokenProofFlow = () => {
        const remainingProofs =
          tokenProofContext?.provas?.filter((item) => item.TRILHA_FK_ID !== activeTrilhaIdValue) ??
          []

        if (remainingProofs.length === 0) {
          saveCollectiveProofToken(null)
          setCollectiveProofToken(null)
          setTokenProofContext(null)
          setPendingFaceFinalMessage(null)
          setIsSatisfactionModalOpen(false)
          closeTrilhaPlayer()
          return
        }

        setTokenProofContext((prev) =>
          prev
            ? {
                ...prev,
                provas: remainingProofs,
                trilhas: remainingProofs.map((item) => item.TRILHA_FK_ID),
              }
            : prev,
        )

        const nextProof = remainingProofs[0]
        const nextTokenProof = buildTokenProofInfo(nextProof)
        const nextTrilha =
          trilhas.find((item) => item.ID === nextProof.TRILHA_FK_ID) ??
          ({
            ID: nextProof.TRILHA_FK_ID,
            MODULO_FK_ID: "__token__",
            TITULO: nextTokenProof?.provaTitulo ?? "Prova individual",
          } as TrilhaItem)

        setPendingFaceFinalMessage(null)
        openTrilhaPlayer(nextTrilha, null, nextTokenProof)
      }

      if (captures.length === 0) {
        if (isTokenFlow) {
          finishTokenProofFlow()
          return
        }
        setPendingFaceFinalMessage(null)
        return
      }

      if (!turmaId) {
        setFaceEvidenceError("Turma nao identificada para registrar a coleta facial.")
        setIsFaceModalOpen(true)
        return
      }

      try {
        setIsSubmittingFaceEvidence(true)
        setFaceEvidenceError(null)
        await attachCollectiveTrainingFaceEvidence({
          turmaId,
          captures: captures.map((capture) => ({
            cpf: capture.cpf,
            fotoBase64: capture.fotoUrl ? null : (capture.fotoBase64 ?? null),
            fotoUrl: capture.fotoUrl ?? null,
            createdAt: capture.createdAt,
          })),
        })
        if (isTokenFlow) {
          finishTokenProofFlow()
          return
        }

        setPendingFaceFinalMessage(null)
      } catch (err) {
        console.error("Erro ao anexar facial do treinamento coletivo:", err)
        setFaceEvidenceError(
          err instanceof Error ? err.message : "Nao foi possivel registrar a coleta facial.",
        )
        setIsFaceModalOpen(true)
      } finally {
        setIsSubmittingFaceEvidence(false)
      }
    },
    [
      activeTrilhaId,
      closeTrilhaPlayer,
      collectiveProofToken,
      openTrilhaPlayer,
      pendingFaceFinalMessage,
      tokenProofContext?.provas,
      tokenProofContext?.turmaId,
      tokenProofsByTrilha,
      trilhas,
    ],
  )

  const handleRetryObjective = useCallback(() => {
    setObjectiveAnswers({})
    setObjectiveResult(null)
    setObjectiveError(null)
    setPlayerMessage("Responda novamente a prova objetiva.")
  }, [])

  const handleSelectEfficacyAnswer = useCallback((questionId: string, optionId: string) => {
    setEfficacyAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }))
    setEfficacyError(null)
  }, [])

  const handleEnterVideoFullscreen = useCallback(async () => {
    const target = playerMediaRef.current
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

  const handleSubmitTrilhaEfficacy = useCallback(async () => {
    if (!activeTrilhaId || !cpf || cpf.length !== 11) {
      setEfficacyError("Nao foi possivel identificar a trilha para registrar a avaliacao.")
      return
    }

    let nivelToSubmit: number | null = null
    if (hasStructuredEfficacyProva && efficacyProva) {
      const unanswered = efficacyProva.QUESTOES.filter((question) => !efficacyAnswers[question.ID])
      if (unanswered.length > 0) {
        setEfficacyError("Responda todas as perguntas da avaliacao de eficacia.")
        return
      }

      nivelToSubmit = computeStructuredEfficacyLevel(efficacyProva, efficacyAnswers)
      if (!nivelToSubmit) {
        setEfficacyError("Nao foi possivel consolidar a avaliacao de eficacia.")
        return
      }
    } else {
      if (!efficacyLevel) {
        setEfficacyError("Selecione uma opcao de avaliacao de eficacia.")
        return
      }
      nivelToSubmit = efficacyLevel
    }

    try {
      setIsSubmittingEfficacy(true)
      setEfficacyError(null)
      await submitTrilhaTrainingEfficacy({
        cpf,
        trilhaId: activeTrilhaId,
        nivel: nivelToSubmit,
        avaliadoEm: new Date().toISOString(),
      })
      setIsEfficacyModalOpen(false)
      setPlayerMessage(
        pendingEfficacyFinalMessage
          ? `${pendingEfficacyFinalMessage} Avaliacao de eficacia registrada.`
          : "Avaliacao de eficacia registrada com sucesso.",
      )

      const isTokenFlow =
        Boolean(collectiveProofToken) &&
        Boolean(activeTrilhaId) &&
        tokenProofsByTrilha.has(activeTrilhaId)
      if (isTokenFlow) {
        setPendingFaceFinalMessage(
          pendingEfficacyFinalMessage
            ? `${pendingEfficacyFinalMessage} Avaliacao de eficacia registrada. Realize agora a coleta facial para concluir.`
            : "Avaliacao de eficacia registrada. Realize agora a coleta facial para concluir.",
        )
        setFaceEvidenceError(null)
        setIsFaceModalOpen(true)
        return
      }

      setPendingEfficacyFinalMessage(null)
    } catch (err) {
      console.error("Erro ao registrar avaliacao de eficacia da trilha:", err)
      setEfficacyError(
        err instanceof Error ? err.message : "Nao foi possivel registrar a avaliacao de eficacia.",
      )
    } finally {
      setIsSubmittingEfficacy(false)
    }
  }, [
    activeTrilhaId,
    collectiveProofToken,
    cpf,
    efficacyAnswers,
    efficacyLevel,
    efficacyProva,
    hasStructuredEfficacyProva,
    closeTrilhaPlayer,
    pendingEfficacyFinalMessage,
    tokenProofsByTrilha,
  ])

  const handleSubmitPlatformSatisfaction = useCallback(async () => {
    if (!cpf || cpf.length !== 11) {
      return
    }
    if (!satisfactionLevel) {
      setSatisfactionError("Selecione uma opcao para responder a pesquisa.")
      return
    }

    try {
      setIsSubmittingSatisfaction(true)
      setSatisfactionError(null)
      await submitPlatformSatisfaction({
        cpf,
        nivelSatisfacao: satisfactionLevel,
        respondidoEm: new Date().toISOString(),
      })
      setIsSatisfactionModalOpen(false)
    } catch (err) {
      console.error("Erro ao responder pesquisa de satisfacao:", err)
      setSatisfactionError(
        err instanceof Error ? err.message : "Nao foi possivel enviar a resposta.",
      )
    } finally {
      setIsSubmittingSatisfaction(false)
    }
  }, [cpf, satisfactionLevel])

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Treinamentos</h1>
          <p className={styles.navSubtitle}>Acompanhe seus treinamentos em andamento</p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Seus cursos</h2>
          <p>Seus cursos atuais e futuros estarao listados abaixo.</p>

          {isLoading ? <p>Carregando treinamentos...</p> : null}
          {error ? <p className={styles.trainingEmpty}>Erro: {error}</p> : null}
          {isResolvingTokenProof ? <p>Validando prova individual do QR Code...</p> : null}
          {tokenProofError ? <p className={styles.trainingEmpty}>Erro: {tokenProofError}</p> : null}
          {faceEvidenceError ? <p className={styles.trainingEmpty}>Erro: {faceEvidenceError}</p> : null}

          {!isLoading && !error && trilhaCards.length === 0 ? (
            <p className={styles.trainingEmpty}>Nenhum treinamento atribuido.</p>
          ) : null}

          {!isLoading && !error && trilhaCards.length > 0 ? (
            <div className={styles.trainingCardsGrid}>
              {trilhaCards.map(({ trilha, videoCount, documentCount, tokenProof }) => (
                <article key={trilha.ID} className={styles.trainingTrilhaCard}>
                  <h4 className={styles.trainingBlockTitle}>{trilha.TITULO}</h4>
                  <p className={styles.trainingMeta}>
                    {[
                      videoCount > 0
                        ? `${videoCount} ${videoCount === 1 ? "video" : "videos"}`
                        : null,
                      documentCount > 0
                        ? `${documentCount} ${documentCount === 1 ? "documento" : "documentos"}`
                        : null,
                      tokenProof ? "prova individual" : null,
                    ]
                      .filter(Boolean)
                      .join(" + ")}
                  </p>
                  <Button
                    text="Assistir"
                    onClick={() => openTrilhaPlayer(trilha, null, tokenProof)}
                    disabled={videoCount === 0 && documentCount === 0 && !tokenProof}
                  />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        open={isPlayerModalOpen}
        onClose={closeTrilhaPlayer}
        size="full"
        className={isActiveTokenProofFlow ? styles.trainingPlayerModalIndividual : undefined}
        backdropClassName={isActiveTokenProofFlow ? styles.trainingPlayerBackdropIndividual : undefined}
        bodyClassName={isActiveTokenProofFlow ? styles.trainingPlayerModalBodyIndividual : undefined}
        hideHeader={isActiveTokenProofFlow}
        closeOnBackdrop={!isActiveTokenProofFlow}
        title={activeTrilhaTitle || "Trilha"}
      >
        <div className={styles.trainingModal}>
          <div className={styles.trainingModalHeader}>
            <div>
              <h4 className={styles.trainingModalTitle}>{activeTrilhaTitle}</h4>
              <p className={styles.trainingModalHint}>
                {completedMaterialsInTrilha}/{totalMaterialsInTrilha} materiais concluidos
              </p>
            </div>
            {isActiveTokenProofFlow ? (
              <Button text="Fechar" variant="ghost" size="sm" onClick={closeTrilhaPlayer} />
            ) : null}
          </div>

          <div
            className={`${styles.trainingModalBody} ${
              isActiveTokenProofFlow ? styles.trainingModalBodyIndividual : ""
            }`}
          >
            <div className={styles.trainingPlayerPanel}>
              <div className={styles.trainingPlayerHeader}>
                <span className={styles.trainingPlayerTitle}>
                  {isObjectivePhase
                    ? objectiveProva?.TITULO || "Prova objetiva"
                    : currentPdf
                      ? resolvePdfTitle(currentPdf.PDF_PATH)
                    : currentVideo
                      ? currentVideoDisplayKind === "video"
                        ? resolveVideoTitle(currentVideo.PATH_VIDEO)
                        : resolveDocumentTitle(
                            currentVideo.PATH_VIDEO,
                            currentVideoBadgeLabel,
                          )
                      : "Selecione um conteudo"}
                </span>
                <span className={styles.trainingPlayerMeta}>
                  {isObjectivePhase
                    ? `${answeredCount}/${totalQuestions} questoes respondidas`
                    : currentPdf
                      ? "Material em PDF"
                    : currentVideo
                      ? currentVideoDisplayKind === "video" && currentVideoIndex >= 0
                        ? `Conteudo ${currentVideoIndex + 1} de ${activeQueue.length}`
                        : `Arquivo ${currentVideoBadgeLabel}`
                      : ""}
                </span>
                {!isObjectivePhase && currentVideo && currentVideoDisplayKind === "video" ? (
                  <Button
                    text="Tela cheia"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleEnterVideoFullscreen()
                    }}
                  />
                ) : null}
              </div>

              {isObjectivePhase ? (
                objectiveProva ? (
                  <div className={styles.trainingProvaArea}>
                    {objectiveProva.QUESTOES.map((question) => (
                      <article key={question.ID} className={styles.trainingProvaQuestion}>
                        <div className={styles.trainingProvaQuestionHeader}>
                          <strong>
                            Questao {question.ORDEM}
                          </strong>
                          <span>Peso {question.PESO}</span>
                        </div>
                        <p className={styles.trainingProvaQuestionText}>{question.ENUNCIADO}</p>
                        <div className={styles.trainingProvaOptions}>
                          {question.OPCOES.map((option) => {
                            const checked = objectiveAnswers[question.ID] === option.ID
                            const gabaritoItem = objectiveResult?.gabarito.find(
                              (item) => item.questaoId === question.ID,
                            )
                            const isCorrectOption =
                              Boolean(objectiveResult) &&
                              gabaritoItem?.opcaoCorretaId === option.ID
                            const isMarkedWrong =
                              Boolean(objectiveResult) &&
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
                                  name={`question-${question.ID}`}
                                  checked={checked}
                                  disabled={Boolean(objectiveResult)}
                                  onChange={() => handleSelectObjectiveAnswer(question.ID, option.ID)}
                                />
                                <span>{option.TEXTO}</span>
                              </label>
                            )
                          })}
                        </div>
                      </article>
                    ))}

                    {objectiveError ? (
                      <p className={styles.trainingProvaError}>{objectiveError}</p>
                    ) : null}

                    {objectiveResult ? (
                      <div className={styles.trainingProvaResult}>
                        <strong>
                          Nota {objectiveResult.nota.toFixed(2)} / 10 - {objectiveResult.aprovado ? "Aprovado" : "Reprovado"}
                        </strong>
                        <span>
                          Media minima: {objectiveResult.media}. Acertos: {objectiveResult.acertos}/{objectiveResult.totalQuestoes}
                        </span>
                      </div>
                    ) : null}

                    <div className={styles.trainingProvaActions}>
                      {!objectiveResult ? (
                        <Button
                          text="Enviar Prova"
                          onClick={() => {
                            void handleSubmitObjective()
                          }}
                          isLoading={isSubmittingObjective}
                          disabled={isSubmittingObjective || answeredCount < totalQuestions}
                        />
                      ) : objectiveResult.aprovado ? (
                        isActiveTokenProofFlow ? (
                          <Button
                            text="Continuar para Avaliacao"
                            onClick={() => {
                              openTrilhaEfficacyModal(
                                "Prova concluida com sucesso. Realize agora a avaliacao de eficacia para continuar.",
                              )
                            }}
                          />
                        ) : (
                          <Button text="Fechar" onClick={closeTrilhaPlayer} />
                        )
                      ) : (
                        <Button text="Tentar Novamente" onClick={handleRetryObjective} />
                      )}
                    </div>
                  </div>
                ) : isObjectiveLoading ? (
                  <div className={styles.trainingPlayerPlaceholder}>Carregando prova...</div>
                ) : (
                  <div className={styles.trainingPlayerPlaceholder}>
                    Prova objetiva nao encontrada para esta trilha.
                  </div>
                )
              ) : currentPdf ? (
                <div className={styles.trainingPdfContainer}>
                  <div className={styles.trainingPdfActions}>
                    <Button
                      text="Abrir em nova aba"
                      variant="ghost"
                      onClick={() => {
                        const src = resolvePdfPreviewUrl(
                          currentPdf.ID,
                          currentPdf.VERSAO,
                          currentPdf.PDF_PATH,
                        )
                        if (!src) return
                        window.open(src, "_blank", "noopener,noreferrer")
                      }}
                    />
                    <Button
                      text={
                        completedPdfByKey[buildCompletionKey(currentPdf.ID, currentPdf.VERSAO)]
                          ? "Leitura concluida"
                          : "Concluir leitura"
                      }
                      onClick={() => {
                        void handleCompleteCurrentPdf()
                      }}
                    />
                  </div>
                  <iframe
                    className={styles.trainingPdfFrame}
                    src={resolvePdfPreviewUrl(
                      currentPdf.ID,
                      currentPdf.VERSAO,
                      currentPdf.PDF_PATH,
                    )}
                    title={resolvePdfTitle(currentPdf.PDF_PATH)}
                  />
                </div>
              ) : currentVideo ? (
                <div ref={playerMediaRef} className={styles.trainingMediaWrapper}>
                  {currentVideoDisplayKind === "pdf" ? (
                    <div className={styles.trainingPdfContainer}>
                      <div className={styles.trainingPdfActions}>
                        <Button
                        text="Abrir em nova aba"
                        variant="ghost"
                        onClick={() => {
                            const src = resolvePdfPreviewUrl(
                              currentVideo.ID,
                              currentVideo.VERSAO,
                              currentVideo.PATH_VIDEO,
                            )
                            if (!src) return
                            window.open(src, "_blank", "noopener,noreferrer")
                          }}
                        />
                        <Button
                          text="Concluir e continuar"
                          onClick={() => {
                            void advanceToNextVideo()
                          }}
                        />
                      </div>
                      <iframe
                        key={`${currentVideo.ID}-${currentVideo.VERSAO ?? 1}`}
                        className={styles.trainingPdfFrame}
                        src={resolvePdfPreviewUrl(
                          currentVideo.ID,
                          currentVideo.VERSAO,
                          currentVideo.PATH_VIDEO,
                        )}
                        title={resolveDocumentTitle(currentVideo.PATH_VIDEO, "PDF")}
                      />
                    </div>
                  ) : currentVideoDisplayKind === "document" ? (
                    <div className={styles.trainingPdfContainer}>
                      <div className={styles.trainingPdfActions}>
                        <Button
                          text="Abrir arquivo"
                          variant="ghost"
                          onClick={() => {
                            const src = resolveAssetUrl(currentVideo.PATH_VIDEO ?? "")
                            if (!src) return
                            window.open(src, "_blank", "noopener,noreferrer")
                          }}
                        />
                        <Button
                          text="Concluir e continuar"
                          onClick={() => {
                            void advanceToNextVideo()
                          }}
                        />
                      </div>
                      <div className={styles.trainingPlayerPlaceholder}>
                        Arquivo {currentVideoBadgeLabel} carregado para esta trilha. Use
                        <strong> Abrir arquivo </strong>
                        para visualizar o conteudo e depois conclua para continuar.
                      </div>
                    </div>
                  ) : getYouTubeId(currentVideo.PATH_VIDEO ?? "") ? (
                    <YouTubeQueuePlayer
                      video={currentVideo.PATH_VIDEO ?? ""}
                      title={resolveVideoTitle(currentVideo.PATH_VIDEO)}
                      onEnded={() => {
                        void advanceToNextVideo()
                      }}
                    />
                  ) : (
                    <video
                      key={`${currentVideo.ID}-${currentVideo.VERSAO ?? 1}`}
                      className={styles.trainingVideo}
                      controls
                      autoPlay
                      preload="metadata"
                      src={resolveAssetUrl(currentVideo.PATH_VIDEO ?? "")}
                      onTimeUpdate={handleHtmlVideoTimeUpdate}
                      onEnded={() => {
                        void advanceToNextVideo()
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className={styles.trainingPlayerPlaceholder}>Nenhum material disponivel.</div>
              )}

              {playerMessage ? (
                <p className={styles.trainingVideoDone}>{playerMessage}</p>
              ) : null}
            </div>

            {!isActiveTokenProofFlow ? (
              <div className={styles.trainingQueuePanel}>
                <div className={styles.trainingQueueHeader}>
                  <h4>{isObjectivePhase ? "Resumo da trilha" : "Materiais da trilha"}</h4>
                  <span className={styles.trainingQueueCount}>{totalMaterialsInTrilha}</span>
                </div>

                <ul className={styles.trainingQueueList}>
                  {activeQueue.map((video, index) => {
                    const key = buildCompletionKey(video.ID, video.VERSAO)
                    const isDone = Boolean(completedByKey[key])
                    const isActive = currentVideo?.ID === video.ID
                    const displayKind = resolveTrainingMaterialDisplayKind(
                      video.PATH_VIDEO,
                      video.TIPO_CONTEUDO,
                    )
                    const badgeLabel = resolveTrainingMaterialBadgeLabel(
                      video.PATH_VIDEO,
                      video.TIPO_CONTEUDO,
                    )
                    return (
                      <li
                        key={`${video.ID}-${video.VERSAO ?? index}`}
                        className={`${styles.trainingQueueItem} ${isActive ? styles.trainingQueueActive : ""}`}
                      >
                        <button
                          type="button"
                          className={styles.trainingQueueButton}
                          disabled={isObjectivePhase}
                          onClick={() => {
                            setCurrentVideoId(video.ID)
                            setCurrentPdfId(null)
                            setPlayerMessage(null)
                            setIsObjectivePhase(false)
                          }}
                        >
                          <div className={styles.trainingQueueInfo}>
                            <span
                              className={`${styles.trainingQueueTypeBadge} ${
                                isDone
                                  ? styles.trainingQueueTypeDone
                                  : displayKind === "video"
                                    ? styles.trainingQueueTypeVideo
                                    : styles.trainingQueueTypePdf
                              }`}
                            >
                              {isDone ? "Concluido" : badgeLabel}
                            </span>
                            <span className={styles.trainingQueueTitle}>
                              {displayKind === "video"
                                ? resolveVideoTitle(video.PATH_VIDEO)
                                : resolveDocumentTitle(video.PATH_VIDEO, badgeLabel)}
                            </span>
                            <span className={styles.trainingQueueMeta}>
                              {isDone
                                ? `Concluido em ${formatDateTime(completedByKey[key])}`
                                : displayKind === "video"
                                  ? `Ordem ${video.ORDEM ?? index + 1}`
                                  : `Arquivo ${badgeLabel}`}
                            </span>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {activeTrilhaPdfs.length > 0 ? (
                  <div className={styles.trainingPdfListSection}>
                    <h5 className={styles.trainingPdfListTitle}>PDFs da trilha</h5>
                    <ul className={styles.trainingPdfList}>
                      {activeTrilhaPdfs.map((pdf) => {
                        const isActive = currentPdf?.ID === pdf.ID
                        const completionKey = buildCompletionKey(pdf.ID, pdf.VERSAO)
                        const completedAt = completedPdfByKey[completionKey]
                        const isDone = Boolean(completedAt)
                        return (
                          <li key={`${pdf.ID}-${pdf.VERSAO}`}>
                            <button
                              type="button"
                              className={`${styles.trainingPdfButton} ${
                                isActive ? styles.trainingPdfButtonActive : ""
                              }`}
                              onClick={() => {
                                setCurrentPdfId(pdf.ID)
                                setCurrentVideoId(null)
                                setIsObjectivePhase(false)
                                setPlayerMessage(null)
                              }}
                            >
                              <span
                                className={`${styles.trainingQueueTypeBadge} ${
                                  isDone ? styles.trainingQueueTypeDone : styles.trainingQueueTypePdf
                                }`}
                              >
                                {isDone ? "Concluido" : "PDF"}
                              </span>
                              <span className={styles.trainingPdfInfo}>
                                <span className={styles.trainingPdfName}>
                                  {resolvePdfTitle(pdf.PDF_PATH)}
                                </span>
                                <span className={styles.trainingQueueMeta}>
                                  {isDone
                                    ? `Concluido em ${formatDateTime(completedAt)}`
                                    : "Leitura pendente"}
                                </span>
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}
                {isObjectivePhase && objectiveProva ? (
                  <div className={styles.trainingQueueObjectiveStatus}>
                    <span className={styles.trainingQueueTypeBadge}>Prova Final</span>
                    <span className={styles.trainingQueueMeta}>
                      {objectiveResult
                        ? `Status: ${objectiveResult.aprovado ? "Aprovado" : "Reprovado"}`
                        : "Aguardando envio da prova"}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={isEfficacyModalOpen}
        onClose={() => undefined}
        size="md"
        title="Avaliacao de eficacia"
        showClose={false}
      >
        <div className={styles.trainingEficacyModal}>
          {hasStructuredEfficacyProva && efficacyProva ? (
            <>
              {structuredEfficacyTitle ? (
                <p className={styles.trainingEficacyQuestion}>{structuredEfficacyTitle}</p>
              ) : null}
              <p className={styles.trainingEficacyHint}>
                Responda {structuredEfficacyAnsweredCount} de {efficacyProva.QUESTOES.length} pergunta(s).
              </p>

              {efficacyProva.QUESTOES.map((question) => (
                <div key={question.ID} className={styles.trainingEficacyModal}>
                  <p className={styles.trainingEficacyQuestion}>{question.ENUNCIADO}</p>
                  <div className={styles.trainingEficacyOptions}>
                    {question.OPCOES.map((option) => (
                      <label key={option.ID} className={styles.trainingEficacyOption}>
                        <input
                          type="radio"
                          name={`training-efficacy-${question.ID}`}
                          checked={efficacyAnswers[question.ID] === option.ID}
                          onChange={() => {
                            void handleSelectEfficacyAnswer(question.ID, option.ID)
                          }}
                        />
                        <span>{option.TEXTO}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <p className={styles.trainingEficacyQuestion}>{activeTrilhaEfficacyQuestion}</p>

              <div className={styles.trainingEficacyOptions}>
                {TRAINING_EFFICACY_OPTIONS.map((option) => (
                  <label key={option.value} className={styles.trainingEficacyOption}>
                    <input
                      type="radio"
                      name="training-efficacy"
                      checked={efficacyLevel === option.value}
                      onChange={() => {
                        setEfficacyLevel(option.value)
                        setEfficacyError(null)
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {efficacyError ? <p className={styles.trainingProvaError}>{efficacyError}</p> : null}

          <div className={styles.trainingProvaActions}>
            <Button
              text="Salvar avaliacao e finalizar"
              onClick={() => {
                void handleSubmitTrilhaEfficacy()
              }}
              isLoading={isSubmittingEfficacy}
              disabled={
                isSubmittingEfficacy ||
                (
                  hasStructuredEfficacyProva
                    ? structuredEfficacyAnsweredCount !== (efficacyProva?.QUESTOES.length ?? 0)
                    : !efficacyLevel
                )
              }
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={isSatisfactionModalOpen}
        onClose={() => setIsSatisfactionModalOpen(false)}
        size="md"
        title="Pesquisa de Satisfacao da Plataforma"
      >
        <div className={styles.trainingEficacyModal}>
          <p className={styles.trainingEficacyQuestion}>{PLATFORM_SATISFACTION_QUESTION}</p>

          <div className={styles.trainingEficacyOptions}>
            {PLATFORM_SATISFACTION_OPTIONS.map((option) => (
              <label key={option.value} className={styles.trainingEficacyOption}>
                <input
                  type="radio"
                  name="platform-satisfaction"
                  checked={satisfactionLevel === option.value}
                  onChange={() => {
                    setSatisfactionLevel(option.value)
                    setSatisfactionError(null)
                  }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {satisfactionError ? <p className={styles.trainingProvaError}>{satisfactionError}</p> : null}

          <div className={styles.trainingProvaActions}>
            <Button
              text="Responder depois"
              variant="ghost"
              onClick={() => setIsSatisfactionModalOpen(false)}
            />
            <Button
              text="Enviar resposta"
              onClick={() => {
                void handleSubmitPlatformSatisfaction()
              }}
              isLoading={isSubmittingSatisfaction}
              disabled={!satisfactionLevel || isSubmittingSatisfaction}
            />
          </div>
        </div>
      </Modal>

      <FacialEnrollmentModal
        open={isFaceModalOpen}
        onClose={() => {
          if (isSubmittingFaceEvidence) return
          setIsFaceModalOpen(false)
        }}
        participants={selfFaceParticipants}
        instructorCpf={cpf}
        mode="individual"
        onCompleted={(captures) => {
          void handleFaceCompleted(captures)
        }}
      />
    </>
  )
}

export default TrainingsPage
