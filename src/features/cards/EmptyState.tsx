import { Database, Plus } from 'lucide-react'

interface EmptyStateProps {
  onAddCard: () => void
}

export const EmptyState = ({ onAddCard }: EmptyStateProps) => {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        {/* 아이콘 */}
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent-glow)] border border-[var(--bg-card-border)]">
            <Database size={32} className="text-[var(--accent)]" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg">
            <Plus size={14} strokeWidth={3} />
          </div>
        </div>

        {/* 텍스트 */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[var(--text-primary)] m-0">
            아직 카드가 없습니다
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
            접속정보, 계정정보, 서버정보, 메모 등을<br />
            카드로 정리하고 빠르게 참조하세요.
          </p>
        </div>

        {/* CTA 버튼 */}
        <button
          type="button"
          onClick={onAddCard}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer border-none shadow-md shadow-[var(--accent-glow)]"
        >
          <Plus size={16} />
          첫 번째 카드 추가
        </button>

        <p className="text-xs text-[var(--text-placeholder)]">
          사이드바의 "새 카드 추가" 버튼으로도 시작할 수 있어요
        </p>
      </div>
    </div>
  )
}
