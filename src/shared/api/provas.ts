import { apiFetch } from "./client"

export type ObjectiveProvaPlayerOption = {
  ID: string
  ORDEM: number
  TEXTO: string
}

export type ObjectiveProvaPlayerQuestion = {
  ID: string
  ORDEM: number
  ENUNCIADO: string
  PESO: number
  OPCOES: ObjectiveProvaPlayerOption[]
}

export type ObjectiveProvaPlayerRecord = {
  ID: string
  TRILHA_FK_ID: string
  VERSAO: number
  MODO_APLICACAO?: "coletiva" | "individual"
  TITULO: string | null
  NOTA_TOTAL: number | null
  ATUALIZADO_EM: string | null
  QUESTOES: ObjectiveProvaPlayerQuestion[]
}

export type ObjectiveProvaSubmissionResult = {
  nota: number
  media: number
  status: "aprovado" | "reprovado"
  acertos: number
  totalQuestoes: number
  aprovado: boolean
  gabarito: Array<{
    questaoId: string
    enunciado: string
    peso: number
    opcaoMarcadaId: string | null
    opcaoMarcadaTexto: string | null
    opcaoCorretaId: string
    opcaoCorretaTexto: string
    acertou: boolean
  }>
  prova: {
    id: string
    versao: number
    titulo: string | null
  }
}

export type CollectiveObjectiveProvaSubmissionResult =
  ObjectiveProvaSubmissionResult & {
    usuariosAvaliados: number
    tentativasRegistradas: number
    aprovacoesRegistradas: number
  }

export type CollectiveIndividualProofQrResponse = {
  token: string
  redirectUrl: string
  qrCodeImageUrl: string
  expiresAt: string
  totalUsuarios: number
  trilhas: Array<{
    ID: string
    TRILHA_FK_ID: string
    VERSAO: number
    MODO_APLICACAO: "coletiva" | "individual"
    TITULO: string | null
    NOTA_TOTAL: number | null
  }>
}

export type CollectiveIndividualProofTokenResolveResponse = {
  token: string
  expiresAt: string
  turmaId: string | null
  trilhas: string[]
  cpfs: string[]
  provas: Array<{
    ID: string
    TRILHA_FK_ID: string
    VERSAO: number
    MODO_APLICACAO: "coletiva" | "individual"
    TITULO: string | null
    NOTA_TOTAL: number | null
  }>
}

export async function fetchObjectiveProvaForPlayer(
  trilhaId: string,
  cpf?: string,
  token?: string,
) {
  const search = new URLSearchParams()
  if (cpf?.trim()) {
    search.set("cpf", cpf.trim())
  }
  if (token?.trim()) {
    search.set("token", token.trim())
  }

  const suffix = search.toString() ? `?${search.toString()}` : ""
  return apiFetch<{ prova: ObjectiveProvaPlayerRecord | null }>(
    `/api/provas/trilha/${encodeURIComponent(trilhaId)}/objectiva/player${suffix}`,
  )
}

export async function submitObjectiveProvaForPlayer(payload: {
  trilhaId: string
  cpf: string
  respostas: Array<{ questaoId: string; opcaoId: string }>
  user?: Record<string, string>
  token?: string
}) {
  return apiFetch<ObjectiveProvaSubmissionResult>(
    `/api/provas/trilha/${encodeURIComponent(payload.trilhaId)}/objectiva/player/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        cpf: payload.cpf,
        respostas: payload.respostas,
        user: payload.user,
        token: payload.token,
      }),
    },
  )
}

export async function submitObjectiveProvaForCollective(payload: {
  trilhaId: string
  users: Array<Record<string, string>>
  respostas: Array<{ questaoId: string; opcaoId: string }>
  turmaId?: string
  concluidoEm?: string
  origem?: string
}) {
  return apiFetch<CollectiveObjectiveProvaSubmissionResult>(
    `/api/provas/trilha/${encodeURIComponent(payload.trilhaId)}/objectiva/instrutor/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        users: payload.users,
        respostas: payload.respostas,
        turmaId: payload.turmaId,
        concluidoEm: payload.concluidoEm,
        origem: payload.origem,
      }),
    },
  )
}

export async function fetchLatestObjectiveProvaResult(trilhaId: string, cpf: string) {
  return apiFetch<{
    result:
      | {
          ID: string
          USUARIO_CPF: string
          PROVA_ID: string
          PROVA_VERSAO: number
          TRILHA_ID: string
          NOTA: number
          STATUS: "aprovado" | "reprovado"
          ACERTOS: number
          TOTAL_QUESTOES: number
          DT_REALIZACAO: string
          RESPOSTAS?: unknown
        }
      | null
  }>(
    `/api/provas/trilha/${encodeURIComponent(trilhaId)}/objectiva/player/result?cpf=${encodeURIComponent(cpf)}`,
  )
}

export async function generateCollectiveIndividualProofQr(payload: {
  users: Array<Record<string, string>>
  trilhaIds: string[]
  turmaId?: string
}) {
  return apiFetch<CollectiveIndividualProofQrResponse>(
    "/api/provas/objectiva/instrutor/individual/qr",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )
}

export async function resolveCollectiveIndividualProofToken(token: string, cpf?: string) {
  const search = new URLSearchParams()
  if (cpf?.trim()) {
    search.set("cpf", cpf.trim())
  }
  const suffix = search.toString() ? `?${search.toString()}` : ""
  return apiFetch<CollectiveIndividualProofTokenResolveResponse>(
    `/api/provas/objectiva/instrutor/individual/qr/${encodeURIComponent(token)}${suffix}`,
  )
}
