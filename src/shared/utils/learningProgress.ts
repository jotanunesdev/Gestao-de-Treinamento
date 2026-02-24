export type LastWatchedProgress = {
  cpf: string
  videoId: string
  videoVersao: number
  trilhaId: string
  pathVideo: string | null
  titulo: string | null
  currentTimeSec?: number | null
  durationSec?: number | null
  updatedAt: string
}

const STORAGE_KEY = "gtreinamento:last-watched:v1"

const normalizeCpf = (value: string) => value.replace(/\D/g, "")

const parseStore = () => {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, LastWatchedProgress>
    if (!parsed || typeof parsed !== "object") return {}
    return parsed
  } catch {
    return {}
  }
}

const writeStore = (store: Record<string, LastWatchedProgress>) => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota/security errors
  }
}

export const getLastWatchedProgress = (cpf: string) => {
  const digits = normalizeCpf(cpf)
  if (digits.length !== 11) return null
  const store = parseStore()
  return store[digits] ?? null
}

export const upsertLastWatchedProgress = (
  cpf: string,
  progress: Omit<LastWatchedProgress, "cpf" | "updatedAt">,
) => {
  const digits = normalizeCpf(cpf)
  if (digits.length !== 11) return

  const store = parseStore()
  store[digits] = {
    cpf: digits,
    ...progress,
    updatedAt: new Date().toISOString(),
  }
  writeStore(store)
}

export const clearLastWatchedProgressByVideo = (
  cpf: string,
  videoId: string,
  videoVersao?: number | null,
) => {
  const digits = normalizeCpf(cpf)
  if (digits.length !== 11) return

  const store = parseStore()
  const current = store[digits]
  if (!current) return

  const sameVideo = current.videoId === videoId
  const sameVersion =
    videoVersao === undefined || videoVersao === null || current.videoVersao === videoVersao

  if (!sameVideo || !sameVersion) return
  delete store[digits]
  writeStore(store)
}

