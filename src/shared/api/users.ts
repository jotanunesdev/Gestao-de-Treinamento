import { apiFetch } from "./client"
import type { BackendUser } from "./auth"

export type UserListRecord = {
  CPF: string
  NOME: string | null
  CARGO: string | null
  SETOR: string | null
  ATIVO: boolean | null
  INSTRUTOR: boolean | null
}

export type CompanyEmployeeRecord = {
  CPF: string
  NOME: string | null
  NOME_FUNCAO: string | null
  NOMEDEPARTAMENTO: string | null
  raw: Record<string, string>
}

export type CompanyEmployeeObraRecord = {
  codigo: string | null
  nome: string
}

export async function getUserByCpf(cpf: string) {
  return apiFetch<{ user: BackendUser }>(`/api/users/${encodeURIComponent(cpf)}`)
}

export async function listUsers(filters?: {
  cpf?: string
  nome?: string
  ativo?: boolean
  instrutor?: boolean
}) {
  const params = new URLSearchParams()
  if (filters?.cpf?.trim()) params.set("cpf", filters.cpf.trim())
  if (filters?.nome?.trim()) params.set("nome", filters.nome.trim())
  if (filters?.ativo !== undefined) params.set("ativo", String(filters.ativo))
  if (filters?.instrutor !== undefined) {
    params.set("instrutor", String(filters.instrutor))
  }

  const query = params.toString()
  return apiFetch<{ users: UserListRecord[] }>(`/api/users${query ? `?${query}` : ""}`)
}

export async function listCompanyEmployees(filters?: {
  obra?: string
  obraCodigo?: string
  includeLocation?: boolean
}) {
  const params = new URLSearchParams()
  if (filters?.obra?.trim()) params.set("obra", filters.obra.trim())
  if (filters?.obraCodigo?.trim()) params.set("obraCodigo", filters.obraCodigo.trim())
  if (filters?.includeLocation !== undefined) {
    params.set("includeLocation", String(filters.includeLocation))
  }

  const query = params.toString()
  return apiFetch<{ employees: CompanyEmployeeRecord[] }>(
    `/api/users/employees${query ? `?${query}` : ""}`,
  )
}

export async function listCompanyEmployeeObras() {
  return apiFetch<{ obras: CompanyEmployeeObraRecord[] }>("/api/users/employees/obras")
}
