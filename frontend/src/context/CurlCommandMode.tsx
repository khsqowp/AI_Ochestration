import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CurlCommandMode } from '../lib/curl-command'

type CurlCommandModeContextValue = {
  mode: CurlCommandMode
  setMode: (mode: CurlCommandMode) => void
}

const STORAGE_KEY = 'diag-curl-command-mode'
const CurlCommandModeContext = createContext<CurlCommandModeContextValue>({ mode: 'unix', setMode: () => undefined })

function initialMode(): CurlCommandMode {
  try { return window.localStorage.getItem(STORAGE_KEY) === 'windows' ? 'windows' : 'unix' }
  catch { return 'unix' }
}

export function CurlCommandModeProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<CurlCommandMode>(initialMode)
  const setMode = (next: CurlCommandMode) => {
    updateMode(next)
    try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* State remains available for this session. */ }
  }
  const value = useMemo(() => ({ mode, setMode }), [mode])
  return <CurlCommandModeContext.Provider value={value}>{children}</CurlCommandModeContext.Provider>
}

export function useCurlCommandMode() { return useContext(CurlCommandModeContext) }

export function CurlCommandModeToggle() {
  const { mode, setMode } = useCurlCommandMode()
  const windows = mode === 'windows'
  return <div className="diag-curl-toolbar">
    <span>명령 형식</span>
    <label>
      <input type="checkbox" checked={windows} onChange={event => setMode(event.target.checked ? 'windows' : 'unix')}/>
      Windows용 curl.exe
    </label>
    <small>현재 명령: <code>{windows ? 'curl.exe' : 'curl'}</code></small>
  </div>
}
