import { type ComponentType, type CSSProperties } from 'react'
import {
  AppWindow, Binary, Bomb, Bug, CloudCog, Compass, Crosshair, Database,
  FileCode2, FlaskConical, FolderSearch, GitBranch, GitCompare, History,
  KeyRound, Layers, Network, Radar, ServerCog, SquareTerminal,
  Terminal,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { CHEATSHEET_CATEGORIES } from '../cheatsheet-data'
import { ROUTE_TREE_TOOLS } from '../route-tree-tools'

/* 진단 탭의 타일은 항목별 모달로 연결되며, 카테고리별 색상은 섹션에서 상속한다. */
const CATEGORY_META: Record<string, { icon: ComponentType<{ size?: number }>; color: string }> = {
  payloads: { icon: FlaskConical, color: '#7667dc' },
  decoder: { icon: Binary, color: '#2f9e68' },
  'cloud-config': { icon: CloudCog, color: '#4338ca' },
  cdn: { icon: Network, color: '#0e9488' },
  techstack: { icon: Layers, color: '#c2740c' },
  'git-secrets': { icon: GitBranch, color: '#d14343' },
  'dns-takeover': { icon: Radar, color: '#a3298a' },
  'network-recon': { icon: Crosshair, color: '#1d4ed8' },
  'web-attack': { icon: Bug, color: '#b91c1c' },
  'credential-attack': { icon: KeyRound, color: '#a16207' },
  'internal-network': { icon: ServerCog, color: '#15803d' },
  exploitation: { icon: Bomb, color: '#581c87' },
  linux: { icon: SquareTerminal, color: '#334155' },
  windows: { icon: AppWindow, color: '#0284c7' },
  database: { icon: Database, color: '#713f12' },
}

/* network-recon부터는 표준 펜테스트 도구 모음, linux부터는 OS 명령어 모음 — 구분용 라벨. */
const GROUP_LABELS: Record<string, string> = {
  'network-recon': 'TOOL',
  linux: 'OS',
}

export function DiagnosticsPage() {
  return <div className="page diag-page">
    <div className="diag-grid">
      <section className="diag-section" style={{ '--diag-accent': '#6b7280' } as CSSProperties}>
        <h3 className="diag-section-title"><Compass size={14}/>분석 도구</h3>
        <div className="diag-tile-grid">
          <Link className="diag-tile" to="/dashboard/diag/scanner-tools">
            <FolderSearch size={20}/><span>정찰/취약점 스캐너</span>
          </Link>
          {ROUTE_TREE_TOOLS.map(({ id, name, icon: Icon }) => <Link className="diag-tile" key={id} to={`/dashboard/diag/${id}`}>
            <Icon size={20}/><span>{name}</span>
          </Link>)}
          <Link className="diag-tile" to="/dashboard/diag/js-parser">
            <FileCode2 size={20}/><span>JS Beautifier & 추출기</span>
          </Link>
          <Link className="diag-tile" to="/dashboard/diag/burp-comparer">
            <GitCompare size={20}/><span>Burp Comparer</span>
          </Link>
          <Link className="diag-tile" to="/dashboard/diag/burp-history-viewer">
            <History size={20}/><span>Burp History 뷰어</span>
          </Link>
        </div>
      </section>

      {CHEATSHEET_CATEGORIES.map(category => {
        const meta = CATEGORY_META[category.id] ?? { icon: Terminal, color: '#7667dc' }
        const Icon = meta.icon
        const groupLabel = GROUP_LABELS[category.id]
        return <div className="diag-group" key={category.id}>
          {groupLabel && <div className="diag-group-divider"><span>{groupLabel}</span></div>}
          <section className="diag-section" style={{ '--diag-accent': meta.color } as CSSProperties}>
            <h3 className="diag-section-title"><Icon size={14}/>{category.name}</h3>
            <div className="diag-tile-grid">
              {category.tools.map(t => <Link className="diag-tile" key={t.id} to={`/dashboard/diag/${t.id}`}>
                <Icon size={20}/><span>{t.name}</span>
              </Link>)}
            </div>
          </section>
        </div>
      })}
    </div>
  </div>
}
