import { test, expect } from '@playwright/test'

// 세션 복원 회귀 방어
//
// activeTab === null 은 "값이 없음"이 아니라 **"사용자가 메인 화면에 있었다"는 명시적 상태**다.
// 이걸 stale id와 똑같이 취급해 마지막 탭으로 폴백하면, 메인에서 새로고침만 했는데
// 열어본 적 없는 카드가 열린다(App.tsx restoreSession).

const SESSION_KEY = 'dev-note:session-tabs'

async function seedCards(page: import('@playwright/test').Page, titles: string[]) {
  return page.evaluate(async (list: string[]) => {
    const req = indexedDB.open('dev-note')
    const db: IDBDatabase = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const tx = db.transaction('items', 'readwrite')
    const store = tx.objectStore('items')
    const now = Date.now()
    const ids: number[] = []
    for (const title of list) {
      const r = store.add({
        title, type: 'note', content: '{"text":""}', folderId: null,
        tags: [], createdAt: now, updatedAt: now, order: now, draft: false, pinned: 0,
      })
      ids.push(await new Promise<number>((res) => { r.onsuccess = () => res(r.result as number) }))
    }
    await new Promise((res) => { tx.oncomplete = res })
    db.close()
    return ids
  }, titles)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dev-note-announcement-dismissed', Date.now().toString())
  })
  await page.goto('/')
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })
})

test('메인 화면에서 새로고침하면 탭이 열려 있어도 메인이 유지된다', async ({ page }) => {
  const ids = await seedCards(page, ['SESSION-A', 'SESSION-B', 'SESSION-C'])

  // 탭 3개가 열려 있고 사용자는 메인 화면(활성 탭 없음)에 있는 상태를 기록
  await page.evaluate(
    ([key, tabs]) => localStorage.setItem(key as string, JSON.stringify({ openTabs: tabs, activeTab: null })),
    [SESSION_KEY, ids] as const,
  )

  await page.reload()
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })
  await page.waitForTimeout(600)

  // 메인(카드 그리드)이 보여야 하고, 어떤 카드도 편집기로 열려 있으면 안 된다
  const restored = await page.evaluate(() => {
    const raw = localStorage.getItem('dev-note:session-tabs')
    return { snapshot: raw ? (JSON.parse(raw) as { activeTab: number | null }) : null }
  })
  expect(restored.snapshot?.activeTab).toBeNull()
  // 카드 그리드가 살아있음 = 편집기가 자리를 차지하지 않았음
  await expect(page.locator('main h3:has-text("SESSION-A")')).toBeVisible()
})

test('카드를 보던 중 새로고침하면 그 카드가 그대로 복원된다', async ({ page }) => {
  const ids = await seedCards(page, ['SESSION-A', 'SESSION-B', 'SESSION-C'])

  // 마지막 탭이 아닌 **가운데** 탭을 활성으로 둔다 — 폴백(마지막 탭)과 구분되도록
  await page.evaluate(
    ([key, tabs, active]) =>
      localStorage.setItem(key as string, JSON.stringify({ openTabs: tabs, activeTab: active })),
    [SESSION_KEY, ids, ids[1]] as const,
  )

  await page.reload()
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })
  await page.waitForTimeout(600)

  const snapshot = await page.evaluate(() => {
    const raw = localStorage.getItem('dev-note:session-tabs')
    return raw ? (JSON.parse(raw) as { activeTab: number | null }) : null
  })
  expect(snapshot?.activeTab).toBe(ids[1])
})
