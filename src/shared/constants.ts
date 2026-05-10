import { Terminal, Database, Globe, FileText, FileStack, Shield, Link, Code } from 'lucide-react'
import type { ItemType } from '../core/db'
import type { SectionType } from '../core/types'

/** 카드 타입별 Lucide 아이콘 컴포넌트 매핑 (단일 정의) */
export const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  document: FileStack,
}

/** 섹션 타입 메타 — 아이콘·레이블·이모지 단일 정의 */
export const SECTION_META: Record<SectionType, {
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  emoji: string
}> = {
  credentials: { label: '접속 정보', icon: Shield,   emoji: '🔑' },
  urls:         { label: 'URL',      icon: Link,     emoji: '🔗' },
  env:          { label: '환경변수', icon: Terminal,  emoji: '⚙️' },
  code:         { label: '코드',     icon: Code,     emoji: '💻' },
  markdown:     { label: '메모',     icon: FileText,  emoji: '📝' },
}

/** 섹션 추가 옵션 배열 (DocumentEditor / CardFormModal 공용) */
export const SECTION_OPTIONS = (
  ['credentials', 'urls', 'env', 'code', 'markdown'] as SectionType[]
).map((type) => ({ type, ...SECTION_META[type] }))

/** 기본 폴더명 */
export const DEFAULT_FOLDER_NAME = '새 폴더'
/** 기본 항목 제목 */
export const DEFAULT_ITEM_TITLE = '제목없음'
/** DnD 순서 기본 간격 */
export const DEFAULT_ORDER_GAP = 1000
/** 트리 깊이별 들여쓰기 (px) */
export const TREE_DEPTH_INDENT_PX = 12
