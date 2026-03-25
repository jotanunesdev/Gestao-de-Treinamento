import { apiFetch } from "./client"

export type ChannelItem = {
  ID: string
  NOME: string
  CRIADO_POR?: string | null
  PATH?: string | null
}

export async function listChannels() {
  return apiFetch<{ channels: ChannelItem[] }>("/api/canais")
}
