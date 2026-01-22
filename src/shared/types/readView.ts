export type PFuncItem = {
  NOMEFILIAL?: string
  NOME_FUNCAO?: string
  NOME_SECAO?: string
  NOME?: string
  [key: string]: string | undefined
}

export type ReadViewResponse = {
  PFunc?: PFuncItem[] | PFuncItem
}
