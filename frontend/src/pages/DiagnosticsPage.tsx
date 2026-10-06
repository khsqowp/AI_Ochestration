import { type ComponentType } from 'react'
import { AppWindow, Binary, Database, FolderSearch, GitCompare, Route, ShieldAlert, SquareTerminal, Terminal, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'

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
  return <div className="page diag-page">
    <div className="diag-grid">
      <section className="diag-section">
        <h3 className="diag-section-title"><ShieldAlert size={14}/>진단</h3>
        <div className="diag-tile-grid">
          <Link className="diag-tile" to="/dashboard/diag/prompt-injection">
            <ShieldAlert size={20}/><span>프롬프트 인젝션</span>
          </Link>
          <Link className="diag-tile" to="/dashboard/diag/scanner-tools">
            <FolderSearch size={20}/><span>정찰/취약점 스캐너</span>
          </Link>
          <Link className="diag-tile" to="/dashboard/diag/route-tree">
            <Route size={20}/><span>경로 트리 분석기</span>
          </Link>
          <Link className="diag-tile" to="/dashboard/diag/burp-comparer">
            <GitCompare size={20}/><span>Burp Comparer</span>
          </Link>
        </div>
      </section>

      {CHEATSHEET_CATEGORIES.map(category => {
        const Icon = CATEGORY_ICON[category.id] ?? Terminal
        return <section className="diag-section" key={category.id}>
          <h3 className="diag-section-title"><Icon size={14}/>{category.name}</h3>
          <div className="diag-tile-grid">
            {category.tools.map(t => <Link className="diag-tile" key={t.id} to={`/dashboard/diag/${t.id}`}>
              <Icon size={20}/><span>{t.name}</span>
            </Link>)}
          </div>
        </section>
      })}
    </div>
  </div>
}
