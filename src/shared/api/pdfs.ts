import { apiFetch } from "./client"

export type PdfItem = {
  ID: string
  TRILHA_FK_ID: string
  PDF_PATH: string | null
  VERSAO: number
}

export async function fetchUserPdfs(cpf: string) {
  return apiFetch<{ pdfs: PdfItem[] }>(`/api/pdfs?cpf=${encodeURIComponent(cpf)}`)
}

export async function fetchPdfsByTrilha(trilhaId: string) {
  return apiFetch<{ pdfs: PdfItem[] }>(`/api/pdfs?trilhaId=${encodeURIComponent(trilhaId)}`)
}
