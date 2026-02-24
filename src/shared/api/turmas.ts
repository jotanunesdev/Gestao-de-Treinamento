import { apiFetch, apiUpload } from "./client"

export type TurmaRecord = {
  ID: string
  NOME: string
  STATUS: string
  CRIADO_POR: string | null
  CRIADO_EM: string
  INICIADO_EM: string | null
  FINALIZADO_EM: string | null
  DURACAO_TREINAMENTO_MINUTOS?: number | null
  TOTAL_PARTICIPANTES: number
  TOTAL_TREINADOS: number
}

export async function createCollectiveTurma(payload: {
  nome?: string
  users: Array<Record<string, string>>
  criadoPor?: string
  iniciadoEm?: string
  obraLocal?: string
}) {
  return apiFetch<{ turma: TurmaRecord }>("/api/turmas", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function listCollectiveTurmas(search?: string) {
  const query = new URLSearchParams()
  if (search?.trim()) {
    query.set("search", search.trim())
  }
  const suffix = query.toString() ? `?${query.toString()}` : ""
  return apiFetch<{ turmas: TurmaRecord[] }>(`/api/turmas${suffix}`)
}

export async function getCollectiveTurmaById(turmaId: string) {
  return apiFetch<{
    turma: TurmaRecord
    participantes: Array<{
      TURMA_ID: string
      USUARIO_CPF: string
      USUARIO_NOME: string | null
      USUARIO_FUNCAO: string | null
      USUARIO_SETOR: string | null
      INSCRITO_EM: string
      VIDEOS_CONCLUIDOS: number
      ULTIMA_CONCLUSAO: string | null
    }>
  }>(`/api/turmas/${encodeURIComponent(turmaId)}`)
}

export async function uploadCollectiveTurmaEvidence(payload: {
  turmaId: string
  duracaoHoras: number
  duracaoMinutos: number
  criadoPor?: string
  finalizadoEm?: string
  obraLocal?: string
  files: File[]
}) {
  const formData = new FormData()
  formData.set("duracaoHoras", String(payload.duracaoHoras))
  formData.set("duracaoMinutos", String(payload.duracaoMinutos))
  if (payload.criadoPor?.trim()) {
    formData.set("criadoPor", payload.criadoPor.trim())
  }
  if (payload.finalizadoEm) {
    formData.set("finalizadoEm", payload.finalizadoEm)
  }
  if (payload.obraLocal?.trim()) {
    formData.set("obraLocal", payload.obraLocal.trim())
  }
  for (const file of payload.files) {
    formData.append("files", file)
  }

  return apiUpload<{
    turma: TurmaRecord
    evidencias: Array<{ arquivoPath: string; ordem: number }>
  }>(`/api/turmas/${encodeURIComponent(payload.turmaId)}/evidencias`, formData, {
    method: "POST",
  })
}
