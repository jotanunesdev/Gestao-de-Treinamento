import { useEffect, useMemo, useState } from "react"
import styles from "./main.module.css"
import { useReadViewContext } from "../../app/readViewContext"
import type { ReadViewResponse, PFuncItem } from "../../shared/types/readView"
import {
  listCompletedVideoTrainings,
  type UserVideoCompletionRecord,
} from "../../shared/api/userTrainings"
import YouTubeThumbnail from "../../shared/ui/video/YouTubeThumbnail"

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

type GroupedByModule = Record<
  string,
  {
    moduleName: string
    trilhas: Record<
      string,
      {
        trilhaTitle: string
        items: UserVideoCompletionRecord[]
      }
    >
  }
>

const CompletedCoursesPage = () => {
  const { data } = useReadViewContext<ReadViewResponse>()
  const [completions, setCompletions] = useState<UserVideoCompletionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    listCompletedVideoTrainings(cpf)
      .then((response) => {
        if (cancelled) return
        setCompletions(response.completions ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Erro ao carregar concluidos")
      })
      .finally(() => {
        if (cancelled) return
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cpf])

  const grouped = useMemo<GroupedByModule>(() => {
    return completions.reduce<GroupedByModule>((acc, item) => {
      const moduleEntry = acc[item.MODULO_ID] ?? {
        moduleName: item.MODULO_NOME,
        trilhas: {},
      }
      const trilhaEntry = moduleEntry.trilhas[item.TRILHA_ID] ?? {
        trilhaTitle: item.TRILHA_TITULO,
        items: [],
      }
      trilhaEntry.items.push(item)
      moduleEntry.trilhas[item.TRILHA_ID] = trilhaEntry
      acc[item.MODULO_ID] = moduleEntry
      return acc
    }, {})
  }, [completions])

  return (
    <>
      <header className={styles.nav}>
        <div>
          <h1 className={styles.navTitle}>Cursos Finalizados</h1>
          <p className={styles.navSubtitle}>Historico de certificados e conclucoes</p>
        </div>
      </header>

      <section className={styles.content}>
        <div className={styles.contentCard}>
          <h2>Concluidos recentemente</h2>
          <p>Abaixo estao os videos concluidos com data e trilha.</p>

          {isLoading ? <p>Carregando concluidos...</p> : null}
          {error ? <p className={styles.trainingEmpty}>Erro: {error}</p> : null}
          {!isLoading && !error && completions.length === 0 ? (
            <p className={styles.trainingEmpty}>Nenhum video concluido ainda.</p>
          ) : null}

          {!isLoading &&
            !error &&
            Object.entries(grouped).map(([moduleId, moduleGroup]) => (
              <div key={moduleId} className={styles.training_content}>
                <h4>{moduleGroup.moduleName}</h4>
                {Object.entries(moduleGroup.trilhas).map(([trilhaId, trilhaGroup]) => (
                  <div key={trilhaId} className={styles.trainingBlock}>
                    <h5 className={styles.trainingBlockTitle}>{trilhaGroup.trilhaTitle}</h5>
                    <div className={styles.grid_video_area}>
                      {trilhaGroup.items.map((item) => {
                        const path = item.PATH_VIDEO ?? ""
                        const youtubeId = path ? getYouTubeId(path) : null
                        const src = path ? resolveAssetUrl(path) : ""
                        const title = resolveVideoTitle(path)
                        return (
                          <div
                            key={`${item.MATERIAL_ID}-${item.MATERIAL_VERSAO}-${item.DT_CONCLUSAO}`}
                            className={styles.trainingVideoCard}
                          >
                            {youtubeId ? (
                              <YouTubeThumbnail
                                video={path}
                                title={title}
                                className={styles.trainingThumb}
                                status="concluido"
                              />
                            ) : src ? (
                              <video
                                className={styles.trainingVideo}
                                controls
                                preload="metadata"
                                src={src}
                              />
                            ) : (
                              <div className={styles.trainingVideoPlaceholder}>Video indisponivel</div>
                            )}
                            <div className={styles.trainingVideoMeta}>
                              <span className={styles.trainingVideoDone}>
                                Concluido em {formatDateTime(item.DT_CONCLUSAO)}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      </section>
    </>
  )
}

export default CompletedCoursesPage
