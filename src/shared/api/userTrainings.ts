import { apiFetch } from "./client"

export type UserVideoCompletionRecord = {
  USUARIO_CPF: string
  USUARIO_NOME: string | null
  MATERIAL_ID: string
  MATERIAL_VERSAO: number | null
  DT_CONCLUSAO: string
  ORIGEM: string | null
  TRILHA_ID: string
  TRILHA_TITULO: string
  MODULO_ID: string
  MODULO_NOME: string
  PATH_VIDEO: string | null
}

export async function completeVideoTraining(payload: {
  cpf: string
  videoId: string
  materialVersao?: number
  concluidoEm?: string
  origem?: string
  user?: Record<string, string>
}) {
  return apiFetch<{ inserted: number; completedAt: string }>("/api/user-trainings/complete", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function completePdfTraining(payload: {
  cpf: string
  pdfId: string
  materialVersao?: number
  concluidoEm?: string
  origem?: string
  user?: Record<string, string>
}) {
  const normalizedCpf = payload.cpf.replace(/\D/g, "")
  return apiFetch<{ inserted: number }>("/api/user-trainings", {
    method: "POST",
    body: JSON.stringify({
      users: [
        {
          ...(payload.user ?? {}),
          CPF: normalizedCpf,
        },
      ],
      trainings: [
        {
          tipo: "pdf",
          materialId: payload.pdfId,
          materialVersao: payload.materialVersao ?? null,
        },
      ],
      concluidoEm: payload.concluidoEm,
      origem: payload.origem ?? "player-pdf",
    }),
  })
}

export async function listCompletedVideoTrainings(cpf: string) {
  return apiFetch<{ completions: UserVideoCompletionRecord[] }>(
    `/api/user-trainings/completions/videos/${encodeURIComponent(cpf)}`,
  )
}

export async function recordCollectiveTraining(payload: {
  users: Array<Record<string, string>>
  trainings: Array<{
    tipo: "video" | "pdf"
    materialId: string
    materialVersao?: number | null
  }>
  turmaId?: string
  concluidoEm?: string
  origem?: string
}) {
  return apiFetch<{ inserted: number }>("/api/user-trainings", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function attachCollectiveTrainingFaceEvidence(payload: {
  turmaId: string
  obraLocal?: string
  captures: Array<{
    cpf: string
    fotoBase64?: string | null
    fotoUrl?: string | null
    createdAt?: string
  }>
}) {
  return apiFetch<{ processed: number; updated: number }>("/api/user-trainings/face-evidence", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function submitTrilhaTrainingEfficacy(payload: {
  cpf: string
  trilhaId: string
  nivel: number
  avaliadoEm?: string
}) {
  return apiFetch<{ updated: number }>("/api/user-trainings/eficacia/trilha", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function submitCollectiveTrainingEfficacy(payload: {
  turmaId: string
  avaliacoes: Array<{ cpf: string; nivel: number }>
  avaliadoEm?: string
}) {
  return apiFetch<{ processed: number; updated: number }>("/api/user-trainings/eficacia/turma", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export type UserTrilhaCompletionRecord = {
  USUARIO_CPF: string
  TRILHA_ID: string
  TRILHA_TITULO: string
  MODULO_ID: string
  MODULO_NOME: string
  DT_CONCLUSAO: string
}

export async function completeTrilhaTraining(payload: {
  cpf: string
  trilhaId: string
  concluidoEm?: string
  origem?: string
}) {
  return apiFetch<{ success: boolean }>("/api/user-trainings/complete-trilha", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function listCompletedTrilhas(cpf: string) {
  return apiFetch<{ completions: UserTrilhaCompletionRecord[] }>(
    `/api/user-trainings/completions/trilhas/${encodeURIComponent(cpf)}`,
  )
}
