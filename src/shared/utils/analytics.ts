// src/shared/utils/analytics.ts
//
// 방문 계측 (쿠키리스). 기본값 = GoatCounter no-JS 픽셀 카운트 엔드포인트.
// - 완전 선택적: VITE_ANALYTICS_ENDPOINT 미설정 시 아무 것도 전송하지 않음(no-op).
// - 3rd-party JS를 실행하지 않고 픽셀 비콘(Image)만 전송 → 공급망 타협·DOM/메모리 접근 위험 제거.
//   (DevNote는 복호화 패스프레이즈를 메모리에 보유하므로 외부 스크립트 실행을 피한다 = zero-knowledge 정합)
// - zero-knowledge: 노트 평문·제목 절대 미전송. 탭 기반이라 경로가 '/dev-note/'로 고정(노트 식별자 없음).

/** 방문 1회를 픽셀 비콘으로 집계한다 (3rd-party 스크립트 실행 없음). */
export function initAnalytics(): void {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined
  if (!endpoint) return // 미설정 → 계측 비활성 (개발·기본 빌드 영향 없음)

  // GoatCounter no-JS 카운트: GET 픽셀. 경로/referrer 메타데이터만 전송.
  const params = new URLSearchParams({
    p: location.pathname,
    r: document.referrer,
  })
  const beacon = new Image()
  beacon.src = `${endpoint}?${params.toString()}`
}
