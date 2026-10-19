import type { ComponentType } from 'react'
import { FileCode2, FolderSearch, GitBranch } from 'lucide-react'

export interface RouteTreeTool {
  id: string
  name: string
  tagline: string
  file: string
  icon: ComponentType<{ size?: number }>
}

export const ROUTE_TREE_TOOLS: RouteTreeTool[] = [
  {
    id: 'har-endpoint-tree',
    name: 'HAR 엔드포인트 트리',
    tagline: 'HAR 파일에서 화면 이동과 API 요청의 관계를 분석합니다.',
    file: 'har-endpoint-tree.html',
    icon: GitBranch,
  },
  {
    id: 'js-route-tree',
    name: 'JS URL · API 경로 트리',
    tagline: 'JavaScript 파일이나 코드에서 URL·API 경로를 추출합니다.',
    file: 'js-route-tree.html',
    icon: FileCode2,
  },
  {
    id: 'common-path-checklist',
    name: '공통 경로 체크리스트',
    tagline: '경로 카테고리를 선택해 Intruder용 목록을 만듭니다.',
    file: 'common-path-checklist.html',
    icon: FolderSearch,
  },
]
