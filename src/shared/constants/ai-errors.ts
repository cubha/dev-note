// src/shared/constants/ai-errors.ts
//
// AI 에러 공통 상수 및 유틸리티
// SmartPastePanel / CardFloatingView 양쪽에서 공유

import { AIError } from '../../core/ai'
import type { AIErrorCode } from '../../core/ai'

// ─── 에러 코드 → 사용자 메시지 매핑 ─────────────────────────

export const AI_ERROR_LABELS: Record<string, string> = {
  auth_error: 'API 키 오류',
  permission_error: 'API 권한 부족',
  credit_exhausted: '크레딧 소진',
  daily_limit_exceeded: '일일 사용 한도 초과',
  anthropic_rate_limit: 'API 호출 한도 초과',
  overloaded: '서버 과부하',
  input_too_long: '입력 텍스트 초과',
  invalid_request: '잘못된 요청',
  invalid_model: '지원하지 않는 모델',
  parse_error: '요청 파싱 오류',
  network_error: '네트워크 연결 실패',
  unknown: '알 수 없는 오류',
}

// ─── ErrorDetail 인터페이스 ────────────────────────────────

export interface ErrorDetail {
  code: AIErrorCode
  httpStatus: number
  message: string
  timestamp: string
  reported: boolean
}

// ─── AI 에러에서 ErrorDetail 추출 ────────────────────────────

export const extractErrorDetail = (err: unknown): ErrorDetail => {
  const timestamp = new Date().toISOString()

  if (err instanceof AIError) {
    return {
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.message,
      timestamp,
      reported: false,
    }
  }

  return {
    code: 'unknown',
    httpStatus: 0,
    message: err instanceof Error ? err.message : '알 수 없는 오류',
    timestamp,
    reported: false,
  }
}
