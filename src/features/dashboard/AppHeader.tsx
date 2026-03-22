// src/features/dashboard/AppHeader.tsx
//
// 통합 앱 헤더 — TabBar(좌측 탭 목록) + SearchFilterBar(우측 검색/필터)

import { TabBar } from './TabBar'
import { SearchFilterBar } from './SearchFilterBar'

export const AppHeader = () => {
  return (
    <div className="flex items-stretch border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 shrink-0 min-h-[44px]">
      <TabBar />
      <SearchFilterBar />
    </div>
  )
}
