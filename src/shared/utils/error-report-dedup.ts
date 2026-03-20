// src/shared/utils/error-report-dedup.ts
//
// 동일 에러코드 중복 리포트 방지 (세션 단위)
// sessionStorage에 리포트 완료된 에러코드를 저장하여
// 같은 세션 내 동일 에러코드 재전송을 차단한다.

const STORAGE_KEY = 'reported_error_codes'

function getReportedCodes(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveReportedCodes(codes: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...codes]))
  } catch {
    // sessionStorage 접근 실패 시 무시
  }
}

/** 해당 에러코드가 이미 리포트되었는지 확인 */
export function isErrorAlreadyReported(code: string): boolean {
  return getReportedCodes().has(code)
}

/** 리포트 완료 후 에러코드를 기록 */
export function markErrorReported(code: string): void {
  const codes = getReportedCodes()
  codes.add(code)
  saveReportedCodes(codes)
}
