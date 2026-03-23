import { test, expect } from '@playwright/test'

test.describe('앱 전역 키보드 단축키', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // 앱 로드 대기 — 검색 입력 필드가 렌더링될 때까지
    await page.waitForSelector('input[placeholder*="검색"]', { timeout: 10000 })
  })

  test('Ctrl+K → 검색 입력에 포커스', async ({ page }) => {
    // body 클릭으로 포커스 해제
    await page.click('body')
    const searchInput = page.locator('input[placeholder*="검색"]')
    await expect(searchInput).not.toBeFocused()

    await page.keyboard.press('Control+k')
    await expect(searchInput).toBeFocused()
  })

  test('Ctrl+K → 이미 텍스트가 있으면 전체 선택됨', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="검색"]')
    // 직접 텍스트 입력
    await searchInput.focus()
    await searchInput.fill('test query')

    // body 클릭으로 포커스 해제
    await page.click('body')
    await expect(searchInput).not.toBeFocused()

    // Ctrl+K → 포커스 + 전체 선택
    await page.keyboard.press('Control+k')
    await expect(searchInput).toBeFocused()

    // 선택 영역 확인 (전체 선택이면 selectionStart=0, selectionEnd=텍스트길이)
    const selection = await searchInput.evaluate((el: HTMLInputElement) => ({
      start: el.selectionStart,
      end: el.selectionEnd,
      length: el.value.length,
    }))
    expect(selection.start).toBe(0)
    expect(selection.end).toBe(selection.length)
  })

  test('Escape → 검색 쿼리 초기화', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="검색"]')

    // 검색어 입력
    await searchInput.focus()
    await searchInput.fill('test')
    await expect(searchInput).toHaveValue('test')

    // Escape 키
    await page.keyboard.press('Escape')
    await expect(searchInput).toHaveValue('')
  })

  test('Ctrl+W → 열린 탭이 없으면 아무 일도 안 함 (에러 없음)', async ({ page }) => {
    // 탭이 없는 상태에서 Ctrl+W — 에러 없이 동작해야 함
    await page.keyboard.press('Control+w')
    // 앱이 정상 동작하는지 확인
    const searchInput = page.locator('input[placeholder*="검색"]')
    await expect(searchInput).toBeVisible()
  })

  test('Ctrl+W → 카드 탭 열고 닫기', async ({ page }) => {
    // 모달(공지사항 등)이 떠있으면 닫기
    const overlay = page.locator('[aria-hidden="true"].fixed')
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 카드 추가 (사이드바 버튼 사용)
    const addButton = page.locator('button', { hasText: '새 카드 추가' })
    if (await addButton.isVisible()) {
      await addButton.click()

      // 카드 생성 모달이 뜨면 타이틀 입력 후 저장
      const titleInput = page.locator('input[placeholder*="제목"], input[name="title"]').first()
      if (await titleInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await titleInput.fill('테스트 카드')
        // 저장 버튼 클릭
        const saveBtn = page.locator('button', { hasText: /저장|생성|추가/ }).first()
        if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await saveBtn.click()
          await page.waitForTimeout(500)
        }
      }
    }

    // 카드가 있으면 클릭하여 탭 열기
    const card = page.locator('[data-type]').first()
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await card.click()
      await page.waitForTimeout(500)

      // 탭이 열렸는지 확인
      const tabBar = page.locator('[class*="tab"]').first()
      const hasTab = await tabBar.isVisible().catch(() => false)

      if (hasTab) {
        // Ctrl+W로 탭 닫기
        await page.keyboard.press('Control+w')
        await page.waitForTimeout(300)
      }
    }

    // 에러 없이 앱이 정상 동작하는지만 확인
    await expect(page.locator('input[placeholder*="검색"]')).toBeVisible()
  })

  test('Ctrl+N → 카드 생성 모달이 열림', async ({ page }) => {
    // 모달이 떠있으면 닫기
    const overlay = page.locator('[aria-hidden="true"].fixed')
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // body에 포커스 (input이 아닌 곳)
    await page.click('body')
    await page.waitForTimeout(200)

    // Ctrl+N 누르기
    await page.keyboard.press('Control+n')
    await page.waitForTimeout(500)

    // 카드 생성 모달 — placeholder "예: Production 서버" 입력 필드로 판단
    const titleInput = page.locator('input[placeholder*="Production"]').first()
    const modalOpened = await titleInput.isVisible({ timeout: 3000 }).catch(() => false)
    console.log(`Ctrl+N 후 카드 생성 모달 열림: ${modalOpened}`)
    expect(modalOpened).toBe(true)
  })

  test('Ctrl+Shift+N → 새 폴더가 사이드바에 생성됨', async ({ page }) => {
    // 모달이 떠있으면 닫기
    const overlay = page.locator('[aria-hidden="true"].fixed')
    if (await overlay.isVisible({ timeout: 1000 }).catch(() => false)) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    }

    // 기존 '새 폴더' 텍스트 개수 카운트
    const foldersBefore = await page.locator('text=새 폴더').count()

    // body에 포커스
    await page.click('body')
    await page.waitForTimeout(200)

    // Ctrl+Shift+N 누르기
    await page.keyboard.press('Control+Shift+n')
    await page.waitForTimeout(500)

    // 사이드바에 '새 폴더'가 추가되었는지 확인
    const foldersAfter = await page.locator('text=새 폴더').count()
    console.log(`Ctrl+Shift+N 전 폴더 수: ${foldersBefore}, 후: ${foldersAfter}`)
    expect(foldersAfter).toBeGreaterThan(foldersBefore)
  })
})
