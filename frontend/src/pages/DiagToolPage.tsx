import { type ComponentType } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'
import { ToolModal } from '../panels/ToolModal'
import { PromptInjectionModal } from '../panels/PromptInjectionModal'
import { ScannerToolsModal } from '../panels/ScannerToolsModal'
import { RouteTreeModal } from '../panels/RouteTreeModal'
import { BurpComparerModal } from '../panels/BurpComparerModal'

const SPECIAL: Record<string, ComponentType<{ embedded?: boolean }>> = {
  'prompt-injection': PromptInjectionModal,
  'scanner-tools': ScannerToolsModal,
  'route-tree': RouteTreeModal,
  'burp-comparer': BurpComparerModal,
}

export function DiagToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const Special = toolId ? SPECIAL[toolId] : undefined
  const tool = !Special && toolId ? CHEATSHEET_CATEGORIES.flatMap(c => c.tools).find(t => t.id === toolId) : undefined

  if (Special) return <div className="page diag-tool-page"><Special embedded/></div>
  if (tool) return <div className="page diag-tool-page"><ToolModal tool={tool} embedded/></div>
  return <Navigate to="/dashboard/diag" replace/>
}
