export const COLLECTIVE_PROOF_TOKEN_KEY = "collectiveProofToken"

export function readCollectiveProofTokenFromStorage() {
  if (typeof window === "undefined") return null
  const token = window.sessionStorage.getItem(COLLECTIVE_PROOF_TOKEN_KEY)
  return token?.trim() ? token.trim() : null
}

export function saveCollectiveProofToken(token: string | null | undefined) {
  if (typeof window === "undefined") return
  const normalized = String(token ?? "").trim()
  if (!normalized) {
    window.sessionStorage.removeItem(COLLECTIVE_PROOF_TOKEN_KEY)
    return
  }
  window.sessionStorage.setItem(COLLECTIVE_PROOF_TOKEN_KEY, normalized)
}

export function consumeCollectiveProofTokenFromUrl(search: string) {
  const params = new URLSearchParams(search)
  const token = params.get("coletivoProvaToken")
  if (!token?.trim()) {
    return null
  }
  const normalized = token.trim()
  saveCollectiveProofToken(normalized)
  params.delete("coletivoProvaToken")
  return {
    token: normalized,
    cleanedSearch: params.toString(),
  }
}
