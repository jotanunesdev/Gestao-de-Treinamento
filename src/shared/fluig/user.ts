type FluigUserLike = Record<string, unknown>

type FluigTopWindow = Window & {
  WCMAPI?: {
    user?: unknown
  }
}

const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e"])

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeNameLikeValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""
  if (!trimmed.includes(" ") && !trimmed.includes("@") && /[._-]/.test(trimmed)) {
    return normalizeWhitespace(trimmed.replace(/[._]+/g, " ").replace(/-/g, " "))
  }
  return normalizeWhitespace(trimmed)
}

function capitalizeWord(word: string, index: number) {
  const lower = word.toLocaleLowerCase("pt-BR")
  if (index > 0 && NAME_PARTICLES.has(lower)) return lower
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1)
}

export function toPersonNameCase(value?: string | null) {
  if (!value) return ""
  const normalized = normalizeNameLikeValue(value)
  if (!normalized) return ""

  return normalized
    .split(" ")
    .map((word, index) =>
      word
        .split("-")
        .map((part) => capitalizeWord(part, index))
        .join("-"),
    )
    .join(" ")
}

function getFluigUserRaw(): unknown {
  if (typeof window === "undefined") return null
  try {
    const topWindow = window.top as FluigTopWindow | null
    const raw = topWindow?.WCMAPI?.user
    if (typeof raw === "function") {
      try {
        return (raw as () => unknown)()
      } catch {
        return null
      }
    }
    return raw ?? null
  } catch {
    return null
  }
}

export function getFluigLoggedUserName() {
  const raw = getFluigUserRaw()
  if (!raw) return null

  if (typeof raw === "string") {
    return toPersonNameCase(raw)
  }

  if (typeof raw !== "object") {
    return null
  }

  const rawRecord = raw as FluigUserLike

  for (const key of [
    "fullName",
    "fullname",
    "name",
    "userName",
    "username",
    "nome",
    "colleagueName",
    "login",
    "userCode",
  ]) {
    const value = rawRecord[key]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return toPersonNameCase(text)
  }

  return null
}
