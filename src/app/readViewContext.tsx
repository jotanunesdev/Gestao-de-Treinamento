import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type ReadViewContextValue = {
  data: unknown | null
  setData: (data: unknown | null) => void
  clearData: () => void
}

const ReadViewContext = createContext<ReadViewContextValue | undefined>(undefined)

type ReadViewProviderProps = {
  children: ReactNode
}

export function ReadViewProvider({ children }: ReadViewProviderProps) {
  const [data, setData] = useState<unknown | null>(null)

  const value = useMemo(
    () => ({
      data,
      setData,
      clearData: () => setData(null),
    }),
    [data],
  )

  return <ReadViewContext.Provider value={value}>{children}</ReadViewContext.Provider>
}

export function useReadViewContext() {
  const context = useContext(ReadViewContext)

  if (!context) {
    throw new Error('useReadViewContext must be used within ReadViewProvider')
  }

  return context
}
