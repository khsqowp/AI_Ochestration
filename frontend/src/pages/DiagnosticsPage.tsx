import { useState, type ComponentType } from 'react'
import { AppWindow, Binary, Database, FolderSearch, ShieldAlert, SquareTerminal, Terminal, Zap } from 'lucide-react'
import { CHEATSHEET_CATEGORIES, type CheatSheetTool } from '../cheatsheet-data'
import { ToolModal } from '../panels/ToolModal'
import { PromptInjectionModal } from '../panels/PromptInjectionModal'
import { PathDiscoveryModal } from '../panels/PathDiscoveryModal'

/* 진단 탭 -- 바둑판식 타일 그리드가 시작 화면이고, 타일을 누르면 그 항목 하나만 다루는
   모달이 곧장 열린다(카테고리 목록을 거치지 않음). 치트시트 카테고리(cheatsheet-data.ts)는
   그대로 재사용하고, 진단 섹션(프롬프트 인젝션)만 별도 타일로 앞에 붙인다. */

const CATEGORY_ICON: Record<string, ComponentType<{ size?: number }>> = {
  payloads: Zap,
  decoder: Binary,
  tools: Terminal,
  linux: SquareTerminal,
  windows: AppWindow,
  database: Database,
}

export function DiagnosticsPage() {
  const [tool, setTool] = useState<CheatSheetTool | null>(null)
  const [promptInjectionOpen, setPromptInjectionOpen] = useState(false)
  const [pathDiscoveryOpen, setPathDiscoveryOpen] = useState(false)

  return <div className="page diag-page">
    <div className="diag-grid">
      <section className="diag-section">
        <h3 className="diag-section-title"><ShieldAlert size={14}/>진단</h3>
        <div className="diag-tile-grid">
          <button className="diag-tile" onClick={() => setPromptInjectionOpen(true)}>
            <ShieldAlert size={20}/><span>프롬프트 인젝션</span>
          </button>
          <button className="diag-tile" onClick={() => setPathDiscoveryOpen(true)}>
            <FolderSearch size={20}/><span>경로/백업 파일 탐색</span>
          </button>
        </div>
      </section>

      {CHEATSHEET_CATEGORIES.map(category => {
        const Icon = CATEGORY_ICON[category.id] ?? Terminal
        return <section className="diag-section" key={category.id}>
          <h3 className="diag-section-title"><Icon size={14}/>{category.name}</h3>
          <div className="diag-tile-grid">
            {category.tools.map(t => <button className="diag-tile" key={t.id} onClick={() => setTool(t)}>
              <Icon size={20}/><span>{t.name}</span>
            </button>)}
          </div>
        </section>
      })}
    </div>

    {tool && <ToolModal tool={tool} onClose={() => setTool(null)}/>}
    {promptInjectionOpen && <PromptInjectionModal onClose={() => setPromptInjectionOpen(false)}/>}
    {pathDiscoveryOpen && <PathDiscoveryModal onClose={() => setPathDiscoveryOpen(false)}/>}
  </div>
}
