import { apiFetch } from "./client"

export type PlatformSatisfactionStatusResponse = {
  deveExibir: boolean
  intervaloDias: number
  ultimaRespostaEm: string | null
  proximaDisponivelEm: string | null
  diasDesdeUltima: number | null
}

export async function getPlatformSatisfactionStatus(cpf: string) {
  return apiFetch<PlatformSatisfactionStatusResponse>(
    `/api/feedbacks/platform-satisfaction/status/${encodeURIComponent(cpf)}`,
  )
}

export async function submitPlatformSatisfaction(payload: {
  cpf: string
  nivelSatisfacao: number
  respondidoEm?: string
}) {
  return apiFetch<{ respondidoEm: string }>("/api/feedbacks/platform-satisfaction", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}
