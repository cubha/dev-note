import { Terminal, Database, Globe, FileText, FileStack } from 'lucide-react'
import type { ItemType } from '../core/db'

/** 카드 타입별 Lucide 아이콘 컴포넌트 매핑 (단일 정의) */
export const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  document: FileStack,
}

/** 기본 폴더명 */
export const DEFAULT_FOLDER_NAME = '새 폴더'
/** 기본 항목 제목 */
export const DEFAULT_ITEM_TITLE = '제목없음'
/** DnD 순서 기본 간격 */
export const DEFAULT_ORDER_GAP = 1000
/** 트리 깊이별 들여쓰기 (px) */
export const TREE_DEPTH_INDENT_PX = 12
