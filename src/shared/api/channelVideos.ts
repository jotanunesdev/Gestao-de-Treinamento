import { apiFetch } from "./client"

export type ChannelVideoItem = {
  ID: string
  CANAL_FK_ID: string
  PATH_VIDEO: string | null
  TIPO_CONTEUDO?: "video" | "pdf"
  PROCEDIMENTO_ID?: string | null
  NORMA_ID?: string | null
  VERSAO: number
  DURACAO_SEGUNDOS?: number | null
}

export async function listChannelVideos(canalId: string) {
  return apiFetch<{ videos: ChannelVideoItem[] }>(
    `/api/canal-videos?canalId=${encodeURIComponent(canalId)}`,
  )
}
