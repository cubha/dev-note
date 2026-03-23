import { useAtomValue, useSetAtom } from 'jotai'
import { activeTabAtom, cardFormAtom } from '../../store/atoms'
import { AppHeader } from './AppHeader'
import { CardGrid } from './CardGrid'
import { CardFormModal } from '../cards/CardFormModal'
import { CardDetailEditor } from '../cards/CardDetailEditor'
import { CardFloatingView } from '../cards/CardFloatingView'
import { TabContextMenu } from './TabContextMenu'

export const Dashboard = () => {
  const cardForm = useAtomValue(cardFormAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const activeTab = useAtomValue(activeTabAtom)

  const handleCloseForm = () => {
    setCardForm({ isOpen: false, editItem: null, folderId: null })
  }

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* 항상 표시되는 통합 헤더 */}
      <AppHeader />

      {/* 본문: 활성 탭 있으면 에디터, 없으면 카드 그리드 */}
      {activeTab !== null ? (
        <CardDetailEditor />
      ) : (
        <CardGrid />
      )}

      {cardForm.isOpen && (
        <CardFormModal
          item={cardForm.editItem}
          folderId={cardForm.folderId}
          onClose={handleCloseForm}
        />
      )}
      <CardFloatingView />
      <TabContextMenu />
    </main>
  )
}
