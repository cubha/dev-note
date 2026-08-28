import { test, expect } from '@playwright/test'

// 모달 고정 레이아웃 · ESC 닫기 회귀 방어
//
// 두 결함 모두 tsc·eslint·빌드로는 잡히지 않아 오래 방치됐던 종류라 E2E로 고정한다.
// 1) 조건부 배너가 모달 높이를 바꾸던 문제 — 안내 슬롯을 항상 고정 높이로 렌더해 해소.
// 2) ESC 닫기가 무동작이던 문제 — @tanstack/react-hotkeys가 document에서 Escape 전파를
//    끊어 window 버블 리스너에 도달하지 않았다. document capture로 받아야 한다.

const backup = (encrypted: boolean) =>
  JSON.stringify({ version: 1, exportedAt: 1, folders: [], items: [], encrypted })

async function openModal(page: import('@playwright/test').Page, encrypted: boolean) {
  await page.addInitScript(
    ([text]: string[]) => {
      localStorage.setItem('dev-note-announcement-dismissed', Date.now().toString())
      // 네이티브 파일 피커는 Playwright가 조작할 수 없다 — 백업 텍스트를 바로 돌려주도록 스텁.
      ;(window as unknown as { showOpenFilePicker: unknown }).showOpenFilePicker = async () => [
        { getFile: async () => ({ text: async () => text }) },
      ]
    },
    [backup(encrypted)],
  )
  await page.goto('/')
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })

  // 기존 데이터 1건 심기 → hasExistingData=true 분기
  await page.evaluate(async () => {
    const req = indexedDB.open('dev-note')
    const db: IDBDatabase = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const tx = db.transaction('items', 'readwrite')
    const now = Date.now()
    tx.objectStore('items').add({
      title: 'SEED', type: 'note', content: '{"text":""}', folderId: null,
      tags: [], createdAt: now, updatedAt: now, order: now, draft: false, pinned: 0,
    })
    await new Promise((res) => { tx.oncomplete = res })
    db.close()
  })

  await page.locator('button[aria-label="가져오기"]').click()
  await page.waitForSelector('dialog >> text=가져오기 방식 선택', { timeout: 5000 })
}

const boxHeight = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const el = document.querySelector('dialog > div') as HTMLElement
    return el.getBoundingClientRect().height
  })

test('라디오를 바꿔도 ImportModeModal 높이가 변하지 않는다', async ({ page }) => {
  await openModal(page, false)
  const appendH = await boxHeight(page)

  await page.locator('input[value="replace"]').check()
  await page.waitForTimeout(300)
  const replaceH = await boxHeight(page)

  console.log(`[plain] append=${appendH} replace=${replaceH}`)
  expect(replaceH).toBe(appendH)

  // 슬롯 내부 텍스트가 잘리지 않는지 — 고정 높이라 넘치면 조용히 스크롤로 숨는다
  const slots = await page.evaluate(() =>
    [...document.querySelectorAll('dialog div[class*="import-note-h"]')].map((e) => ({
      scroll: e.scrollHeight,
      client: e.clientHeight,
    })),
  )
  expect(slots).toHaveLength(2)
  for (const s of slots) expect(s.scroll).toBeLessThanOrEqual(s.client)
})

test('암호화 백업이어도 모달 높이가 같다', async ({ page }) => {
  await openModal(page, true)
  const encAppendH = await boxHeight(page)
  await page.locator('input[value="replace"]').check()
  await page.waitForTimeout(300)
  const encReplaceH = await boxHeight(page)
  console.log(`[encrypted] append=${encAppendH} replace=${encReplaceH}`)
  expect(encReplaceH).toBe(encAppendH)
})

test('CardFloatingView가 ESC로 닫힌다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('dev-note-announcement-dismissed', Date.now().toString())
  })
  await page.goto('/')
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })

  await page.evaluate(async () => {
    const req = indexedDB.open('dev-note')
    const db: IDBDatabase = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const tx = db.transaction('items', 'readwrite')
    const now = Date.now()
    tx.objectStore('items').add({
      title: 'ESC-VIEW', type: 'note', content: '{"text":"hello"}', folderId: null,
      tags: [], createdAt: now, updatedAt: now, order: now, draft: false, pinned: 0,
    })
    await new Promise((res) => { tx.oncomplete = res })
    db.close()
  })
  await page.reload()
  await page.waitForSelector('text=ESC-VIEW', { timeout: 10000 })

  // 카드 hover → "조회 (읽기 전용)" 버튼 노출 → 플로팅 뷰 오픈
  const card = page.locator('main h3:has-text("ESC-VIEW")').first()
  await card.hover()
  await page.locator('button[title*="조회"], button[aria-label*="조회"]').first().click()
  await expect(page.locator('[aria-label="ESC-VIEW 조회"]').first()).toBeVisible({ timeout: 5000 })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await expect(page.locator('[aria-label="ESC-VIEW 조회"]')).toHaveCount(0)
})

test('확인창이 떠 있는 동안 Delete 키로 확인을 우회해 삭제할 수 없다', async ({ page }) => {
  // 예전 window.confirm은 메인 스레드를 멈춰서 이 우회가 불가능했다. Promise 기반 자체
  // 대화상자로 바꾼 뒤 전역 Delete 핫키가 그대로 살아있어 게이트가 뚫렸던 회귀를 고정한다.
  await page.addInitScript(() => {
    localStorage.setItem('dev-note-announcement-dismissed', Date.now().toString())
  })
  await page.goto('/')
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })

  await page.evaluate(async () => {
    const req = indexedDB.open('dev-note')
    const db: IDBDatabase = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const tx = db.transaction('items', 'readwrite')
    const now = Date.now()
    for (const title of ['BYPASS-A', 'BYPASS-B']) {
      tx.objectStore('items').add({
        title, type: 'note', content: '{"text":""}', folderId: null,
        tags: [], createdAt: now, updatedAt: now, order: now, draft: false, pinned: 0,
      })
    }
    await new Promise((res) => { tx.oncomplete = res })
    db.close()
  })
  await page.reload()
  await page.waitForSelector('text=BYPASS-A', { timeout: 10000 })

  // 사이드바에서 2개 선택 → 일괄 삭제 → 확인창 대기
  await page.locator('aside').locator('text=BYPASS-A').click({ modifiers: ['ControlOrMeta'] })
  await page.locator('aside').locator('text=BYPASS-B').click({ modifiers: ['ControlOrMeta'] })
  await page.locator('aside button:has-text("일괄 삭제")').click()
  await expect(page.locator('[role=dialog][aria-label="카드 삭제"]')).toBeVisible({ timeout: 5000 })

  // 확인창이 떠 있는 상태에서 Delete — 아무 일도 일어나면 안 된다
  await page.keyboard.press('Delete')
  await page.waitForTimeout(600)

  const remaining = await page.evaluate(async () => {
    const req = indexedDB.open('dev-note')
    const db: IDBDatabase = await new Promise((res) => { req.onsuccess = () => res(req.result) })
    const all: { title: string }[] = await new Promise((res) => {
      const r = db.transaction('items').objectStore('items').getAll()
      r.onsuccess = () => res(r.result)
    })
    db.close()
    return all.map((i) => i.title).sort()
  })
  expect(remaining).toEqual(['BYPASS-A', 'BYPASS-B'])
  await expect(page.locator('[role=dialog][aria-label="카드 삭제"]')).toBeVisible()
})

test('GuideModal이 ESC로 닫힌다', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })

  // 공지 모달 → "사용방법 보기" → 가이드
  await page.locator('button:has-text("사용방법 보기")').click()
  await expect(page.locator('[aria-label="사용 가이드"]')).toBeVisible({ timeout: 5000 })

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await expect(page.locator('[aria-label="사용 가이드"]')).toHaveCount(0)
})
