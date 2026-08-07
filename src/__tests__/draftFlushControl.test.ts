import { describe, it, expect } from 'vitest'
import { bumpDraftEpoch, bumpAllDraftEpochs, currentDraftEpoch } from '../features/cards/draftFlushControl'

describe('draft epoch 가드', () => {
  it('한 번도 bump되지 않은 itemId는 epoch 0', () => {
    expect(currentDraftEpoch(101)).toBe(0)
  })

  it('bump할 때마다 epoch이 증가한다', () => {
    const id = 202
    const before = currentDraftEpoch(id)
    bumpDraftEpoch(id)
    expect(currentDraftEpoch(id)).toBe(before + 1)
    bumpDraftEpoch(id)
    expect(currentDraftEpoch(id)).toBe(before + 2)
  })

  it('서로 다른 itemId의 epoch은 독립적이다', () => {
    const a = 303
    const b = 404
    bumpDraftEpoch(a)
    expect(currentDraftEpoch(a)).not.toBe(currentDraftEpoch(b))
  })

  it('bumpAllDraftEpochs는 특정 id로 bump한 적 없는 itemId의 epoch도 변화시킨다(db.drafts.clear() 대응)', () => {
    const id = 505
    const before = currentDraftEpoch(id)
    bumpAllDraftEpochs()
    expect(currentDraftEpoch(id)).not.toBe(before)
  })

  it('bumpAllDraftEpochs 이후에도 개별 itemId의 epoch을 캡처-비교하는 패턴이 여전히 성립한다', () => {
    const id = 606
    const epoch = currentDraftEpoch(id)
    bumpAllDraftEpochs()
    expect(currentDraftEpoch(id)).not.toBe(epoch)
    // 재캡처하면 다시 같아짐(다음 변화가 없는 한)
    expect(currentDraftEpoch(id)).toBe(currentDraftEpoch(id))
  })
})
