// src/features/onboarding/announcement-utils.ts
//
// 공지사항 dismiss 유틸리티 (localStorage 기반 24시간)

const DISMISS_KEY = 'dev-note-announcement-dismissed'
const DISMISS_DURATION = 24 * 60 * 60 * 1000 // 24시간

export function shouldShowAnnouncement(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (!dismissed) return true
    return Date.now() - parseInt(dismissed, 10) > DISMISS_DURATION
  } catch {
    return true
  }
}

export function dismissForToday(): void {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
  } catch {
    // 시크릿 모드 등 — graceful 무시
  }
}
