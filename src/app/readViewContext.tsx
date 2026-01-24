import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'gestao-treinamento:readview'

function readStoredData<TData>() {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as TData
  } catch {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function persistData(data: unknown | null) {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  if (data == null) {
    sessionStorage.removeItem(STORAGE_KEY)
    return
  }

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

type ReadViewContextValue<TData = unknown> = {
  data: TData | null
  setData: (data: TData | null) => void
  clearData: () => void
}

const ReadViewContext = createContext<ReadViewContextValue<unknown> | undefined>(
  undefined,
)

type ReadViewProviderProps = {
  children: ReactNode
}

export function ReadViewProvider({ children }: ReadViewProviderProps) {
  const [data, setDataState] = useState<unknown | null>(() => readStoredData())

  const setData = useCallback((next: unknown | null) => {
    setDataState(next)
    persistData(next)
  }, [])

  const clearData = useCallback(() => {
    setData(null)
  }, [setData])

  const value = useMemo(
    () => ({
      data,
      setData,
      clearData,
    }),
    [data, setData, clearData],
  )

  return <ReadViewContext.Provider value={value}>{children}</ReadViewContext.Provider>
}

export function useReadViewContext<TData = unknown>() {
  const context = useContext(ReadViewContext)

  if (!context) {
    throw new Error('useReadViewContext must be used within ReadViewProvider')
  }

  return context as ReadViewContextValue<TData>
}
