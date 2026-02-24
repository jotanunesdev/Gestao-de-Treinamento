import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import styles from "./main.module.css"
import GaugeChart from "../../shared/ui/Gauge/GaugeChart"
import Button from "../../shared/ui/button/Button"
import Modal from "../../shared/ui/modal/Modal"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import {
  fetchUserTrilhas,
  fetchUserVideos,
  type TrilhaItem,
  type VideoItem,
} from "../../shared/api/trainings"
import { listCompletedVideoTrainings } from "../../shared/api/userTrainings"
import {
  getPlatformSatisfactionStatus,
  submitPlatformSatisfaction,
} from "../../shared/api/feedbacks"
import { getLastWatchedProgress } from "../../shared/utils/learningProgress"
import { ROUTES } from "../../app/paths"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faCircleCheck, faPlay, faTrophy } from "@fortawesome/free-solid-svg-icons"
import {
  PLATFORM_SATISFACTION_OPTIONS,
  PLATFORM_SATISFACTION_QUESTION,
} from "../../shared/constants/platformSatisfaction"

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

type SpotlightReason = "interrupted" | "next" | "new"

type SpotlightVideo = {
  trilha: TrilhaItem
  video: VideoItem
  reason: SpotlightReason
  completedInTrilha: number
  totalInTrilha: number
}

type DashboardThumbnailProps = {
  pathVideo: string | null
  title: string
}

const DashboardThumbnail = ({ pathVideo, title }: DashboardThumbnailProps) => {
  if (!pathVideo) {
    return <div className={styles.dashboardThumbPlaceholder}>Video indisponivel</div>
  }

  const youTubeId = getYouTubeId(pathVideo)
  if (youTubeId) {
    return (
      <img
        src={`https://img.youtube.com/vi/${youTubeId}/maxresdefault.jpg`}
        alt={title}
        loading="lazy"
        className={styles.dashboardThumbImage}
        onError={(event) => {
          event.currentTarget.src = `https://img.youtube.com/vi/${youTubeId}/hqdefault.jpg`
        }}
      />
    )
  }

  const src = resolveAssetUrl(pathVideo)
  if (!src) {
    return <div className={styles.dashboardThumbPlaceholder}>Video indisponivel</div>
  }

  return (
    <video
      className={styles.dashboardThumbVideo}
      preload="metadata"
      muted
      playsInline
      src={src}
      aria-label={title}
    />
  )
}

const DashboardPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()
  const navigate = useNavigate()
  const [trilhas, setTrilhas] = useState<TrilhaItem[]>([])
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [completedByKey, setCompletedByKey] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSatisfactionModalOpen, setIsSatisfactionModalOpen] = useState(false)
  const [satisfactionLevel, setSatisfactionLevel] = useState<number | null>(null)
  const [satisfactionError, setSatisfactionError] = useState<string | null>(null)
  const [isSubmittingSatisfaction, setIsSubmittingSatisfaction] = useState(false)

  const pfunc: PFuncItem | undefined = Array.isArray(data?.PFunc)
    ? data?.PFunc[0]
    : data?.PFunc

  const cpf = useMemo(() => {
    const raw = pfunc?.CPF ?? data?.User?.CPF ?? ""
    return raw.replace(/\D/g, "")
  }, [data?.User?.CPF, pfunc?.CPF])

  useEffect(() => {
    if (!cpf || cpf.length !== 11) {
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    Promise.allSettled([fetchUserTrilhas(cpf), fetchUserVideos(cpf), listCompletedVideoTrainings(cpf)])
      .then((results) => {
        if (cancelled) return
        const [trilhasResult, videosResult, completionsResult] = results

        if (trilhasResult.status === "rejected" || videosResult.status === "rejected") {
          const firstError =
            trilhasResult.status === "rejected"
              ? trilhasResult.reason
              : videosResult.status === "rejected"
                ? videosResult.reason
                : new Error("Erro ao carregar dashboard")
          throw firstError
        }

        setTrilhas(trilhasResult.value.trilhas ?? [])
        setVideos(videosResult.value.videos ?? [])

        if (completionsResult.status === "fulfilled") {
          const completionMap = (completionsResult.value.completions ?? []).reduce<
            Record<string, string>
          >((acc, completion) => {
            const key = buildCompletionKey(completion.MATERIAL_ID, completion.MATERIAL_VERSAO)
            acc[key] = completion.DT_CONCLUSAO
            return acc
          }, {})
          setCompletedByKey(completionMap)
        } else {
          setCompletedByKey({})
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Erro ao carregar dashboard")
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
    if (!cpf || cpf.length !== 11) return

    let cancelled = false
    getPlatformSatisfactionStatus(cpf)
      .then((status) => {
        if (cancelled) return
        if (status.deveExibir) {
          setSatisfactionLevel(null)
          setSatisfactionError(null)
          setIsSatisfactionModalOpen(true)
        }
      })
      .catch((err) => {
        console.error("Erro ao consultar pesquisa de satisfacao:", err)
      })

    return () => {
      cancelled = true
    }
  }, [cpf])

  const handleSubmitSatisfaction = useCallback(async () => {
    if (!cpf || cpf.length !== 11) return
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

  const videosByTrilha = useMemo(() => {
    const map = new Map<string, VideoItem[]>()
    for (const video of videos) {
      const list = map.get(video.TRILHA_FK_ID) ?? []
      list.push(video)
      map.set(video.TRILHA_FK_ID, list)
    }

    for (const [trilhaId, list] of map.entries()) {
      const ordered = [...list].sort((a, b) => {
        const orderA = a.ORDEM ?? Number.MAX_SAFE_INTEGER
        const orderB = b.ORDEM ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return a.ID.localeCompare(b.ID)
      })
      map.set(trilhaId, ordered)
    }

    return map
  }, [videos])

  const spotlight = useMemo<SpotlightVideo | null>(() => {
    const isVideoCompleted = (video: VideoItem) =>
      Boolean(completedByKey[buildCompletionKey(video.ID, video.VERSAO)])

    if (cpf && cpf.length === 11) {
      const storedProgress = getLastWatchedProgress(cpf)
      if (storedProgress) {
        const queue = videosByTrilha.get(storedProgress.trilhaId) ?? []
        const targetTrilha = trilhas.find((item) => item.ID === storedProgress.trilhaId)
        const targetVideo = queue.find((video) => {
          if (video.ID !== storedProgress.videoId) return false
          if (storedProgress.videoVersao && video.VERSAO !== storedProgress.videoVersao) return false
          return true
        })

        if (targetTrilha && targetVideo && !isVideoCompleted(targetVideo)) {
          const completedInTrilha = queue.filter((item) => isVideoCompleted(item)).length
          return {
            trilha: targetTrilha,
            video: targetVideo,
            reason: "interrupted",
            completedInTrilha,
            totalInTrilha: queue.length,
          }
        }
      }
    }

    let nextFromInProgress: SpotlightVideo | null = null
    let latestCompletionTime = -1

    for (const trilha of trilhas) {
      const queue = videosByTrilha.get(trilha.ID) ?? []
      if (queue.length === 0) continue

      const completedVideos = queue.filter((item) => isVideoCompleted(item))
      if (completedVideos.length === 0) continue

      const pending = queue.find((item) => !isVideoCompleted(item))
      if (!pending) continue

      const trilhaLatestCompletion = completedVideos.reduce((maxValue, item) => {
        const completedAt = completedByKey[buildCompletionKey(item.ID, item.VERSAO)]
        const timestamp = completedAt ? new Date(completedAt).getTime() : 0
        return Math.max(maxValue, Number.isNaN(timestamp) ? 0 : timestamp)
      }, 0)

      if (trilhaLatestCompletion > latestCompletionTime) {
        latestCompletionTime = trilhaLatestCompletion
        nextFromInProgress = {
          trilha,
          video: pending,
          reason: "next",
          completedInTrilha: completedVideos.length,
          totalInTrilha: queue.length,
        }
      }
    }

    if (nextFromInProgress) {
      return nextFromInProgress
    }

    for (const trilha of trilhas) {
      const queue = videosByTrilha.get(trilha.ID) ?? []
      if (queue.length === 0) continue

      const completedCount = queue.filter((item) => isVideoCompleted(item)).length
      if (completedCount > 0) continue

      return {
        trilha,
        video: queue[0],
        reason: "new",
        completedInTrilha: 0,
        totalInTrilha: queue.length,
      }
    }

    return null
  }, [cpf, trilhas, videosByTrilha, completedByKey])

  const totalAssignedVideos = videos.length
  const totalCompletedVideos = useMemo(
    () =>
      videos.filter((video) => Boolean(completedByKey[buildCompletionKey(video.ID, video.VERSAO)])).length,
    [completedByKey, videos],
  )

  const spotlightTitle = useMemo(
    () => (spotlight ? resolveVideoTitle(spotlight.video.PATH_VIDEO) : null),
    [spotlight],
  )

  const spotlightStatusLabel = useMemo(() => {
    if (!spotlight) return ""
    if (spotlight.reason === "interrupted") return "Em andamento"
    if (spotlight.reason === "next") return "Proximo video"
    return "Nova trilha"
  }, [spotlight])

  const spotlightDescription = useMemo(() => {
    if (!spotlight) return ""
    if (spotlight.reason === "interrupted") {
      return "Retome exatamente o ultimo video que voce estava assistindo."
    }
    if (spotlight.reason === "next") {
      return "Seu ultimo video foi concluido. Continue no proximo da sequencia."
    }
    return "Nova trilha disponivel. Comece pelo primeiro video."
  }, [spotlight])

  const spotlightObservations = useMemo(() => {
    if (!spotlight) return []

    const items: Array<{ label: string; text: string }> = []
    const procedimentoObs = spotlight.video.PROCEDIMENTO_OBSERVACOES?.trim()
    const normaObs = spotlight.video.NORMA_OBSERVACOES?.trim()

    if (procedimentoObs) {
      items.push({ label: "Procedimento", text: procedimentoObs })
    }
    if (normaObs) {
      items.push({ label: "Norma", text: normaObs })
    }

    return items
  }, [spotlight])

  const openSpotlightVideo = useCallback(() => {
    if (!spotlight) return
    navigate(ROUTES.mainTrainings, {
      state: {
        focusTraining: {
          trilhaId: spotlight.trilha.ID,
          videoId: spotlight.video.ID,
        },
      },
    })
  }, [navigate, spotlight])

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Painel</h1>
          <p className={styles.navSubtitle}>Resumo dos Cursos</p>
        </div>

        <GaugeChart
          width={100}
          heigth={100}
          value={totalCompletedVideos}
          totalValue={totalAssignedVideos}
        />
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Continue de onde voce parou</h2>
          <p>Mostramos sempre o video certo para voce continuar.</p>

          {isLoading ? <p>Carregando seu progresso...</p> : null}
          {error ? <p className={styles.trainingEmpty}>Erro: {error}</p> : null}

          {!isLoading && !error && spotlight ? (
            <div className={styles.video_section}>
              <div className={styles.video_content}>
                <span className={styles.dashboardStatusBadge}>{spotlightStatusLabel}</span>
                <div className={styles.dashboardMedia}>
                  <DashboardThumbnail
                    pathVideo={spotlight.video.PATH_VIDEO}
                    title={spotlightTitle ?? "Video"}
                  />
                </div>
                <div className={styles.dashboardMediaMeta}>
                  <h3>{spotlightTitle}</h3>
                  <p>{spotlightDescription}</p>
                </div>
              </div>

              <div className={styles.material}>
                <h2>{spotlight.trilha.TITULO}</h2>
                <p className={styles.trainingMeta}>
                  {spotlight.completedInTrilha}/{spotlight.totalInTrilha} videos concluidos
                </p>
                <div className={styles.dashboardActionList}>
                  <div className={styles.dashboardActionItem}>
                    <FontAwesomeIcon icon={faPlay} className={styles.apoioIcon} />
                    <span>Video pronto para reproducao</span>
                  </div>
                  <div className={styles.dashboardActionItem}>
                    <FontAwesomeIcon icon={faCircleCheck} className={styles.apoioIcon} />
                    <span>Sequencia respeita a ordem definida na trilha</span>
                  </div>
                </div>

                {spotlightObservations.length > 0 ? (
                  <div className={styles.dashboardObservations}>
                    <h3>Observacoes da versao</h3>
                    {spotlightObservations.map((item) => (
                      <div
                        key={`${item.label}:${item.text}`}
                        className={styles.dashboardObservationItem}
                      >
                        <strong>{item.label}:</strong>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <Button
                  text={spotlight.reason === "interrupted" ? "Continuar video" : "Iniciar video"}
                  onClick={openSpotlightVideo}
                />
              </div>
            </div>
          ) : null}

          {!isLoading && !error && !spotlight ? (
            <div className={styles.dashboardCongrats}>
              <FontAwesomeIcon icon={faTrophy} className={styles.dashboardCongratsIcon} />
              <h3>Parabens! Todos os videos atribuidos foram concluidos.</h3>
              <p>
                Assim que novas trilhas forem liberadas, o primeiro video aparecera aqui
                automaticamente.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <Modal
        open={isSatisfactionModalOpen}
        onClose={() => setIsSatisfactionModalOpen(false)}
        title="Pesquisa de Satisfacao da Plataforma"
        size="md"
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
          {satisfactionError ? (
            <p className={styles.trainingProvaError}>{satisfactionError}</p>
          ) : null}
          <div className={styles.trainingProvaActions}>
            <Button text="Responder depois" variant="ghost" onClick={() => setIsSatisfactionModalOpen(false)} />
            <Button
              text="Enviar resposta"
              onClick={() => {
                void handleSubmitSatisfaction()
              }}
              isLoading={isSubmittingSatisfaction}
              disabled={!satisfactionLevel || isSubmittingSatisfaction}
            />
          </div>
        </div>
      </Modal>
    </>
  )
}

export default DashboardPage
