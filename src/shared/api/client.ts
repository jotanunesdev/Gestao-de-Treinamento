export class ApiError extends Error {
  status: number
  data?: unknown

  constructor(status: number, message: string, data?: unknown) {
    super(message)
    this.status = status
    this.data = data
  }
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
const LEGACY_API_PREFIX = "/api"
const STRIP_LEGACY_API_PREFIX_DEFAULT = API_BASE.includes("/treinamento")
const STRIP_LEGACY_API_PREFIX =
  (import.meta.env.VITE_STRIP_LEGACY_API_PREFIX ??
    String(STRIP_LEGACY_API_PREFIX_DEFAULT))
    .toLowerCase()
    .trim() === "true"

function normalizePath(path: string) {
  if (!STRIP_LEGACY_API_PREFIX) {
    return path
  }

  if (path === LEGACY_API_PREFIX) {
    return ""
  }

  if (path.startsWith(`${LEGACY_API_PREFIX}/`)) {
    return path.slice(LEGACY_API_PREFIX.length)
  }

  return path
}

function resolveUrl(path: string) {
  const normalizedPath = normalizePath(path)

  if (normalizedPath.startsWith("http")) {
    return normalizedPath
  }

  if (!API_BASE) {
    return normalizedPath
  }

  return `${API_BASE}${normalizedPath}`
}

async function parseApiResponse<TResponse>(response: Response) {
  const text = await response.text()
  let data: TResponse | null = null

  if (text) {
    try {
      data = JSON.parse(text) as TResponse
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const message =
      (data as { message?: string; error?: string } | null)?.message ??
      (data as { error?: string } | null)?.error ??
      `Erro na requisicao (${response.status})`

    throw new ApiError(response.status, message, data)
  }

  return data as TResponse
}

export async function apiFetch<TResponse>(
  path: string,
  options: RequestInit = {},
) {
  const url = resolveUrl(path)
  const headers = new Headers(options.headers)

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })
  return parseApiResponse<TResponse>(response)
}

export async function apiUpload<TResponse>(
  path: string,
  formData: FormData,
  options: RequestInit = {},
) {
  const url = resolveUrl(path)
  const response = await fetch(url, {
    ...options,
    body: formData,
  })
  return parseApiResponse<TResponse>(response)
}
