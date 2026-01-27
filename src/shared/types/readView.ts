export type PFuncItem = {
  NOMEFILIAL?: string
  NOME_FUNCAO?: string
  NOME_SECAO?: string
  NOME?: string
  CPF?: string
  DTNASCIMENTO?: string
  SEXO?: string
  IDADE?: string
  [key: string]: string | undefined
}

export type ReadViewResponse = {
  PFunc?: PFuncItem[] | PFuncItem
}
