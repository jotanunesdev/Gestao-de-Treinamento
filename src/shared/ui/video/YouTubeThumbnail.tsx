import { useEffect, useMemo, useRef, useState } from "react"
import styles from "./youtubeThumbnail.module.css"

function getYouTubeId(urlOrId: string) {
  // aceita ID puro ou URL
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

type VideoStatus = "nao-iniciado" | "em-andamento" | "concluido"

type Props = {
  video: string // URL ou ID
  alt?: string
  className?: string
  title?: string
  status?: VideoStatus
  onCompleted?: () => void
}

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
    PLAYING: number
  }
}

type YouTubeWindow = Window & {
  YT?: YouTubeApi
  onYouTubeIframeAPIReady?: () => void
}

let youTubeApiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi() {
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

const STATUS_LABELS: Record<VideoStatus, string> = {
  "nao-iniciado": "Não iniciado",
  "em-andamento": "Em andamento",
  concluido: "Concluído",
}

export default function YouTubeThumbnail({
  video,
  alt = "Capa do video",
  className,
  title,
  status,
  onCompleted,
}: Props) {
  const id = useMemo(() => getYouTubeId(video), [video])
  const [useFallback, setUseFallback] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const [hasCompleted, setHasCompleted] = useState(false)
  const [useApiFallback, setUseApiFallback] = useState(false)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const playerContainerRef = useRef<HTMLDivElement | null>(null)

  if (!id) return null

  const src = useFallback
    ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    : `https://img.youtube.com/vi/${id}/maxresdefault.jpg`

  useEffect(() => {
    if (!isPlaying || !id || useApiFallback) {
      return undefined
    }

    let cancelled = false

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !playerContainerRef.current) {
          return
        }

        if (playerRef.current) {
          playerRef.current.destroy()
        }

        playerRef.current = new YT.Player(playerContainerRef.current, {
          videoId: id,
          playerVars: {
            autoplay: 1,
            rel: 0,
          },
          events: {
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) {
                setHasStarted(true)
              }
              if (event.data === YT.PlayerState.ENDED) {
                setHasCompleted(true)
                onCompleted?.()
              }
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) {
          setUseApiFallback(true)
        }
      })

    return () => {
      cancelled = true
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [id, isPlaying, onCompleted, useApiFallback])

  const resolvedStatus: VideoStatus =
    status ?? (hasCompleted ? "concluido" : hasStarted ? "em-andamento" : "nao-iniciado")

  const statusClassName =
    resolvedStatus === "concluido"
      ? styles.statusCompleted
      : resolvedStatus === "em-andamento"
        ? styles.statusInProgress
        : styles.statusNotStarted

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      <span className={`${styles.statusBadge} ${statusClassName}`}>
        {STATUS_LABELS[resolvedStatus]}
      </span>
      {isPlaying ? (
        useApiFallback ? (
          <iframe
            className={styles.player}
            src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
            title={title ?? alt}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div ref={playerContainerRef} className={styles.player} />
        )
      ) : (
        <button
          type="button"
          className={styles.thumbButton}
          onClick={() => {
            setHasStarted(true)
            setIsPlaying(true)
          }}
          aria-label="Reproduzir video"
        >
          <img
            className={styles.thumbnail}
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => {
              if (!useFallback) setUseFallback(true)
            }}
          />
          <span className={styles.play} aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation">
              <circle cx="32" cy="32" r="24" />
              <polygon points="28,22 28,42 44,32" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
