// src/features/dashboard/AppHeader.tsx
//
// 통합 앱 헤더 — TabBar(좌측 탭 목록) + SearchFilterBar(우측 검색/필터)
// 모바일에서 햄버거 버튼으로 사이드바 오버레이 열기

import { useAtom } from 'jotai'
import { Menu } from 'lucide-react'
import { sidebarMobileOpenAtom } from '../../store/atoms'
import { TabBar } from './TabBar'
import { SearchFilterBar } from './SearchFilterBar'

export const AppHeader = () => {
  const [sidebarMobileOpen, setSidebarMobileOpen] = useAtom(sidebarMobileOpenAtom)

  return (
    <div className="flex items-stretch border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 shrink-0 min-h-[44px]">
      {/* 햄버거 버튼 — 모바일에서만 표시 */}
      <button
        type="button"
        className="md:hidden flex items-center justify-center px-2 mr-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none shrink-0"
        onClick={() => setSidebarMobileOpen(true)}
        aria-label="사이드바 열기"
        aria-expanded={sidebarMobileOpen}
        aria-controls="sidebar"
      >
        <Menu size={18} />
      </button>
      <TabBar />
      <SearchFilterBar />
    </div>
  )
}
