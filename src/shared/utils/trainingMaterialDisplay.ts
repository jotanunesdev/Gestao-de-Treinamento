export type TrainingMaterialDisplayKind = "video" | "pdf" | "document"

const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "ppt",
  "pptx",
  "pps",
  "ppsx",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
  "odt",
  "ods",
  "odp",
])

export function resolveTrainingMaterialExtension(pathValue: string | null | undefined) {
  const trimmed = String(pathValue ?? "").trim()
  if (!trimmed) {
    return null
  }

  let pathname = trimmed
  try {
    pathname = new URL(trimmed).pathname
  } catch {
    pathname = trimmed.split(/[?#]/, 1)[0] ?? trimmed
  }

  const fileName = pathname.split("/").pop() ?? ""
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match?.[1]?.toLowerCase() ?? null
}

export function resolveTrainingMaterialDisplayKind(
  pathValue: string | null | undefined,
  explicitType?: string | null,
): TrainingMaterialDisplayKind {
  const normalizedType = String(explicitType ?? "").trim().toLowerCase()
  if (normalizedType === "pdf") {
    return "pdf"
  }

  const extension = resolveTrainingMaterialExtension(pathValue)
  if (extension === "pdf") {
    return "pdf"
  }

  if (extension && DOCUMENT_EXTENSIONS.has(extension)) {
    return "document"
  }

  return "video"
}

export function resolveTrainingMaterialBadgeLabel(
  pathValue: string | null | undefined,
  explicitType?: string | null,
) {
  const displayKind = resolveTrainingMaterialDisplayKind(pathValue, explicitType)
  if (displayKind === "pdf") {
    return "PDF"
  }

  if (displayKind === "document") {
    return (resolveTrainingMaterialExtension(pathValue) ?? "arquivo").toUpperCase()
  }

  return "Video"
}
