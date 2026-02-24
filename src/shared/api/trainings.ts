import { apiFetch } from "./client"

export type ModuleItem = {
  ID: string
  NOME: string
  PATH?: string | null
  DURACAO_SEGUNDOS?: number | null
  DURACAO_HORAS?: number | null
}

export type TrilhaItem = {
  ID: string
  MODULO_FK_ID: string
  TITULO: string
  PATH?: string | null
  DURACAO_SEGUNDOS?: number | null
  DURACAO_HORAS?: number | null
  AVALIACAO_EFICACIA_OBRIGATORIA?: boolean | number | null
  AVALIACAO_EFICACIA_PERGUNTA?: string | null
  AVALIACAO_EFICACIA_ATUALIZADA_EM?: string | null
}

export type VideoItem = {
  ID: string
  TRILHA_FK_ID: string
  PATH_VIDEO: string | null
  PROCEDIMENTO_ID?: string | null
  NORMA_ID?: string | null
  PROCEDIMENTO_OBSERVACOES?: string | null
  NORMA_OBSERVACOES?: string | null
  VERSAO: number
  DURACAO_SEGUNDOS?: number | null
  ORDEM?: number | null
}

export async function fetchUserModules(cpf: string) {
  return apiFetch<{ modules: ModuleItem[] }>(
    `/api/modules?cpf=${encodeURIComponent(cpf)}`,
  )
}

export async function fetchModules() {
  return apiFetch<{ modules: ModuleItem[] }>("/api/modules")
}

export async function fetchUserTrilhas(cpf: string) {
  return apiFetch<{ trilhas: TrilhaItem[] }>(
    `/api/trilhas?cpf=${encodeURIComponent(cpf)}`,
  )
}

export async function fetchTrilhasByModule(moduloId: string) {
  return apiFetch<{ trilhas: TrilhaItem[] }>(
    `/api/trilhas?moduloId=${encodeURIComponent(moduloId)}`,
  )
}

export async function fetchUserVideos(cpf: string) {
  return apiFetch<{ videos: VideoItem[] }>(
    `/api/videos?cpf=${encodeURIComponent(cpf)}`,
  )
}

export async function fetchVideosByTrilha(trilhaId: string) {
  return apiFetch<{ videos: VideoItem[] }>(
    `/api/videos?trilhaId=${encodeURIComponent(trilhaId)}`,
  )
}
