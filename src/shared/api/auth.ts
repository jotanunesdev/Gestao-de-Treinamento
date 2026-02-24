import type { ReadViewResponse } from "../types/readView"
import { apiFetch } from "./client"

export type BackendUser = {
  CPF: string
  NOME?: string | null
  IDADE?: number | null
  SEXO?: string | null
  NOMEFILIAL?: string | null
  DTNASCIMENTO?: string | null
  CARGO?: string | null
  SETOR?: string | null
  PERMISSAO?: string | null
  INSTRUTOR?: boolean | null
}

type AuthResponse = {
  user: BackendUser
  error?: string
  message?: string
}

export async function loginUser(payload: { cpf: string; password: string }) {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function firstAccessUser(payload: {
  cpf: string
  dtNascimento: string
  password: string
}) {
  return apiFetch<AuthResponse>("/api/auth/first-access", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function updateUserPassword(payload: {
  cpf: string
  currentPassword: string
  newPassword: string
}) {
  return apiFetch<AuthResponse>(`/api/auth/password/${payload.cpf}`, {
    method: "PUT",
    body: JSON.stringify({
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    }),
  })
}

export function mapUserToReadView(user: BackendUser): ReadViewResponse {
  const isInstrutor =
    Boolean(user.INSTRUTOR) ||
    (typeof user.PERMISSAO === "string" &&
      user.PERMISSAO.toLowerCase() === "instrutor")

  return {
    PFunc: {
      NOME: user.NOME ?? undefined,
      NOMEFILIAL: user.NOMEFILIAL ?? undefined,
      NOME_FUNCAO: user.CARGO ?? undefined,
      NOME_SECAO: user.SETOR ?? undefined,
      CPF: user.CPF,
      SEXO: user.SEXO ?? undefined,
      IDADE: user.IDADE != null ? String(user.IDADE) : undefined,
      DTNASCIMENTO: user.DTNASCIMENTO ?? undefined,
    },
    User: {
      CPF: user.CPF,
      INSTRUTOR: isInstrutor,
      PERMISSAO: user.PERMISSAO ?? null,
    },
  }
}
