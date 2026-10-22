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
import { RouteTreeToolPage } from './RouteTreeToolPage'
import { ROUTE_TREE_TOOLS } from '../route-tree-tools'

const SPECIAL: Record<string, ComponentType<{ embedded?: boolean }>> = {
  'prompt-injection': PromptInjectionModal,
  'scanner-tools': ScannerToolsModal,
  'burp-comparer': BurpComparerModal,
  'burp-history-viewer': BurpHistoryViewerModal,
  'js-parser': JsParserModal,
  'error-page-fingerprint': ErrorPageFingerprintModal,
}

export function DiagToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const Special = toolId ? SPECIAL[toolId] : undefined
  const tool = !Special && toolId ? CHEATSHEET_CATEGORIES.flatMap(c => c.tools).find(t => t.id === toolId) : undefined

  if (toolId && ROUTE_TREE_TOOLS.some(item => item.id === toolId)) return <RouteTreeToolPage toolId={toolId}/>
  if (Special) return <div className="page diag-tool-page"><Special embedded/></div>
  if (tool) return <div className="page diag-tool-page"><ToolModal tool={tool} embedded/></div>
  return <Navigate to="/dashboard/diag" replace/>
}
