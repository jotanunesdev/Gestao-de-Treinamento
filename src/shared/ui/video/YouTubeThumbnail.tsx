import { useMemo, useState } from "react"
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

type Props = {
  video: string // URL ou ID
  alt?: string
  className?: string
  title?: string
}

export default function YouTubeThumbnail({
  video,
  alt = "Capa do video",
  className,
  title,
}: Props) {
  const id = useMemo(() => getYouTubeId(video), [video])
  const [useFallback, setUseFallback] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)

  if (!id) return null

  const src = useFallback
    ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    : `https://img.youtube.com/vi/${id}/maxresdefault.jpg`

  return (
    <div className={`${styles.root} ${className ?? ""}`}>
      {isPlaying ? (
        <iframe
          className={styles.iframe}
          src={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0`}
          title={title ?? alt}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className={styles.thumbButton}
          onClick={() => setIsPlaying(true)}
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
