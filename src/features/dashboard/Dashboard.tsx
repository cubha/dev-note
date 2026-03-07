import { useAtomValue, useSetAtom } from 'jotai'
import { openTabsAtom, activeTabAtom, cardFormAtom } from '../../store/atoms'
import { TopBar } from './TopBar'
import { CardGrid } from './CardGrid'
import { TabBar } from './TabBar'
import { CardFormModal } from '../cards/CardFormModal'
import { CardDetailEditor } from '../cards/CardDetailEditor'

export function Dashboard() {
  const cardForm = useAtomValue(cardFormAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)

  const handleCloseForm = () => {
    setCardForm({ isOpen: false, editItem: null, folderId: null })
  }

  const hasTabs = openTabs.length > 0 && activeTab !== null

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {hasTabs ? (
        <>
          <TabBar />
          <CardDetailEditor />
        </>
      ) : (
        <>
          <TopBar />
          <CardGrid />
        </>
      )}
      {cardForm.isOpen && (
        <CardFormModal
          item={cardForm.editItem}
          folderId={cardForm.folderId}
          onClose={handleCloseForm}
        />
      )}
    </main>
  )
}
