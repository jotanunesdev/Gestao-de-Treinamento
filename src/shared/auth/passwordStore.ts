const PASSWORDS_STORAGE_KEY = "gestao-treinamento:passwords"
const ACTIVE_CPF_STORAGE_KEY = "gestao-treinamento:active-cpf"

type PasswordStore = Record<string, string>

function canUseSessionStorage() {
  return typeof sessionStorage !== "undefined"
}

export function readPasswordStore(): PasswordStore {
  if (!canUseSessionStorage()) {
    return {}
  }

  const raw = sessionStorage.getItem(PASSWORDS_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw) as PasswordStore
  } catch {
    sessionStorage.removeItem(PASSWORDS_STORAGE_KEY)
    return {}
  }
}

export function getPasswordForCpf(cpf: string) {
  const store = readPasswordStore()
  return store[cpf]
}

export function hasPasswordForCpf(cpf: string) {
  return Boolean(getPasswordForCpf(cpf))
}

export function setPasswordForCpf(cpf: string, password: string) {
  if (!canUseSessionStorage()) {
    return
  }

  const store = readPasswordStore()
  const nextStore: PasswordStore = {
    ...store,
    [cpf]: password,
  }

  sessionStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(nextStore))
}

export function setActiveCpf(cpf: string) {
  if (!canUseSessionStorage()) {
    return
  }

  sessionStorage.setItem(ACTIVE_CPF_STORAGE_KEY, cpf)
}

export function getActiveCpf() {
  if (!canUseSessionStorage()) {
    return ""
  }

  return sessionStorage.getItem(ACTIVE_CPF_STORAGE_KEY) ?? ""
}

export function clearActiveCpf() {
  if (!canUseSessionStorage()) {
    return
  }

  sessionStorage.removeItem(ACTIVE_CPF_STORAGE_KEY)
}

