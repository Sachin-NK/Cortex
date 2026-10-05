import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

interface KeysContextValue {
  keysVersion: number
  bumpKeys: () => void
}

const KeysContext = createContext<KeysContextValue>({
  keysVersion: 0,
  bumpKeys: () => {},
})

export function KeysProvider({ children }: { children: ReactNode }) {
  const [keysVersion, setKeysVersion] = useState(0)
  const bumpKeys = useCallback(() => setKeysVersion(v => v + 1), [])

  return (
    <KeysContext.Provider value={{ keysVersion, bumpKeys }}>
      {children}
    </KeysContext.Provider>
  )
}

export function useKeys() {
  return useContext(KeysContext)
}
