import { test, expect, type Page } from '@playwright/test'

// KEYBINDINGS_STORAGE_KEY(src/store/atoms.ts)와 동일한 값 — 파일 간 import 없이 문자열로 고정.
const STORAGE_KEY = 'dev-note:keybindings'

async function openKeybindingsTab(page: Page) {
  await page.click('button[title="환경설정"]')
  await page.click('text=단축키')
}

/** "새 카드 생성" 행의 바인딩 버튼(라벨과 같은 행의 첫 번째 button) */
function newCardBindingButton(page: Page) {
  return page.locator('text=새 카드 생성').locator('..').locator('button').first()
}

test.describe('커스텀 키바인딩 녹화', () => {
  test.beforeEach(async ({ page }) => {
    // 첫 방문 시 뜨는 공지사항 모달 백드롭이 사이드바 클릭을 가로챈다 — 미리 dismiss 처리.
    await page.addInitScript(() => {
      localStorage.setItem('dev-note-announcement-dismissed', Date.now().toString())
    })
    await page.goto('/')
    await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })
  })

  test.afterEach(async ({ page }) => {
    // 녹화 결과가 localStorage에 남으면 이후 테스트·실사용 세션에 영향을 준다.
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  })

  test('키를 녹화하면 버튼 라벨이 갱신되고 localStorage에 저장된다', async ({ page }) => {
    await openKeybindingsTab(page)

    const bindingButton = newCardBindingButton(page)
    await bindingButton.click()
    await expect(page.locator('text=키를 입력하세요...')).toBeVisible()

    await page.keyboard.press('Control+Alt+9')

    await expect(page.locator('text=키를 입력하세요...')).not.toBeVisible()

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    const parsed = JSON.parse(stored ?? '{}') as Record<string, { userKey: string | null }>
    expect(parsed['card.new']?.userKey).toBe('Mod+Alt+9')
  })

  test('초기화 버튼을 누르면 기본값으로 되돌아가고 localStorage에서 제거된다', async ({ page }) => {
    await openKeybindingsTab(page)

    const row = page.locator('text=새 카드 생성').locator('..')
    await row.locator('button').first().click()
    await page.keyboard.press('Control+Alt+9')
    await expect(page.locator('text=키를 입력하세요...')).not.toBeVisible()

    // 커스텀 키로 바뀐 뒤에만 초기화 아이콘 버튼이 나타난다(두 번째 button)
    await row.locator('button').nth(1).click()

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    const parsed = JSON.parse(stored ?? '{}') as Record<string, unknown>
    expect(parsed['card.new']).toBeUndefined()
  })

  test('이미 사용 중인 키를 녹화하면 충돌 경고가 표시되고 저장되지 않는다', async ({ page }) => {
    await openKeybindingsTab(page)

    const bindingButton = newCardBindingButton(page)
    await bindingButton.click()
    // 검색 포커스(search.focus)의 기본 키(Mod+K)로 시도 → 충돌
    await page.keyboard.press('Control+k')

    await expect(page.locator('text=이미').first()).toBeVisible({ timeout: 3000 })

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    const parsed = JSON.parse(stored ?? '{}') as Record<string, unknown>
    expect(parsed['card.new']).toBeUndefined()
  })

  test('녹화 중 Escape를 누르면 취소되고 기존 키가 유지된다', async ({ page }) => {
    await openKeybindingsTab(page)

    const bindingButton = newCardBindingButton(page)
    await bindingButton.click()
    await expect(page.locator('text=키를 입력하세요...')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.locator('text=키를 입력하세요...')).not.toBeVisible()
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
    const parsed = JSON.parse(stored ?? '{}') as Record<string, unknown>
    expect(parsed['card.new']).toBeUndefined()
  })
})
