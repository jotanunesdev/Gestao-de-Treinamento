import { apiFetch } from "./client"

export type FaceRecord = {
  ID: string
  USUARIO_CPF: string
  USUARIO_NOME: string | null
  FOTO_BASE64: string | null
  FOTO_URL: string | null
  ORIGEM: string | null
  CRIADO_POR: string | null
  CRIADO_EM: string
}

export type FaceMatchCandidate = {
  faceId: string
  cpf: string
  nome: string | null
  distance: number
  confidence: number
  createdAt: string
}

export async function matchFaceDescriptor(payload: {
  descriptor: number[]
  threshold?: number
}) {
  return apiFetch<{
    threshold: number
    match: FaceMatchCandidate | null
    candidates: FaceMatchCandidate[]
  }>("/api/faces/match", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function enrollFace(payload: {
  cpf: string
  descriptor: number[]
  fotoBase64?: string | null
  origem?: string
  criadoPor?: string
  user?: Record<string, string>
}) {
  return apiFetch<{ face: FaceRecord | null }>("/api/faces/enroll", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}
