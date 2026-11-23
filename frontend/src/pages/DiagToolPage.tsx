import { type ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'
import { ToolModal } from '../panels/ToolModal'
import { PromptInjectionModal } from '../panels/PromptInjectionModal'
import { ScannerToolsModal } from '../panels/ScannerToolsModal'
import { BurpComparerModal } from '../panels/BurpComparerModal'
import { BurpHistoryViewerModal } from '../panels/BurpHistoryViewerModal'
import { JsParserModal } from '../panels/JsParserModal'
import { ErrorPageFingerprintModal } from '../panels/ErrorPageFingerprintModal'
import { XssScoutConsoleModal } from '../panels/XssScoutConsoleModal'
import { NetworkDiagnosticsModal } from '../panels/NetworkDiagnosticsModal'
import { CvePocModal } from '../panels/CvePocModal'
import { RouteTreeToolPage } from './RouteTreeToolPage'
import { ROUTE_TREE_TOOLS } from '../route-tree-tools'
import { CurlCommandModeToggle } from '../context/CurlCommandMode'
import { Soft404AnalyzerModal } from '../panels/Soft404AnalyzerModal'
import { ScopeRedirectLinterModal } from '../panels/ScopeRedirectLinterModal'
import { useAppState } from '../context/AppState'

const SPECIAL: Record<string, ComponentType<{ embedded?: boolean }>> = {
  'prompt-injection': PromptInjectionModal,
  'scanner-tools': ScannerToolsModal,
  'burp-comparer': BurpComparerModal,
  'burp-history-viewer': BurpHistoryViewerModal,
  'js-parser': JsParserModal,
  'error-page-fingerprint': ErrorPageFingerprintModal,
  'xss-scout-console': XssScoutConsoleModal,
  'network-diagnose': NetworkDiagnosticsModal,
  'cve-poc': CvePocModal,
  'soft-404-analyzer': Soft404AnalyzerModal,
  'scope-redirect-linter': ScopeRedirectLinterModal,
}

export function DiagToolPage() {
  const { isAdmin } = useAppState()
  const { toolId } = useParams<{ toolId: string }>()
  const Special = toolId ? SPECIAL[toolId] : undefined
  const tool = !Special && toolId ? CHEATSHEET_CATEGORIES.flatMap(c => c.tools).find(t => t.id === toolId) : undefined

  if (toolId === 'burp-history-viewer' && !isAdmin) return <Navigate to="/dashboard/diag" replace/>
  if (toolId && ROUTE_TREE_TOOLS.some(item => item.id === toolId)) return <RouteTreeToolPage toolId={toolId}/>
  if (Special) return <div className="page diag-tool-page"><CurlCommandModeToggle/><Special embedded/></div>
  if (tool) return <div className="page diag-tool-page"><CurlCommandModeToggle/><ToolModal tool={tool} embedded/></div>
  return <Navigate to="/dashboard/diag" replace/>
}
