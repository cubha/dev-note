import { Terminal, Database, Globe, FileText, FileStack } from 'lucide-react'
import type { ItemType } from '../core/db'

/** 카드 타입별 Lucide 아이콘 컴포넌트 매핑 (단일 정의) */
export const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  markdown: FileText,
  document: FileStack,
}
