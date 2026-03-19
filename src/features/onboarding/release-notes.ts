// src/features/onboarding/release-notes.ts
//
// 릴리즈노트 데이터 (TypeScript 상수 배열)
// 새 릴리즈 시 배열 맨 앞에 추가

export interface ReleaseNote {
  version: string
  date: string
  title: string
  highlights: string[]
  type: 'major' | 'minor' | 'patch'
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'v1.2.0',
    date: '2026-03-19',
    title: 'AI 공유 키 모드 & 모델 분기',
    highlights: [
      'Cloudflare Workers 공유 키 모드 — API 키 없이도 AI 기능 사용 가능 (IP당 50회/일)',
      'AI 모델 자동 분기 — Smart Paste는 Haiku(속도), Document Smart Paste는 Sonnet(품질)',
      'Claude Haiku 4.5 모델 ID 수정 (키 검증 실패 버그 수정)',
    ],
    type: 'minor',
  },
  {
    version: 'v1.1.0',
    date: '2026-03-11',
    title: 'MD Smart Paste 마크다운 변환',
    highlights: [
      'MD Smart Paste — 자유 텍스트를 마크다운으로 자동 변환 (리스트, 링크, 코드블록)',
      '섹션별 Smart Paste — 각 섹션 타입에 맞는 붙여넣기 파싱',
      '사이드바 접기/펼치기 토글',
      'Card Edit 저장 버튼 추가',
      'CapsLock Ctrl+S 저장 오류 수정',
    ],
    type: 'minor',
  },
  {
    version: 'v1.0.0',
    date: '2026-03-10',
    title: 'DevNote 첫 번째 릴리즈',
    highlights: [
      '5종 카드 타입 — Server, DB, API, Markdown, Document',
      '폴더 트리 & 드래그 앤 드롭 정렬',
      'Document 카드 — 5종 섹션 에디터 (Markdown, Code, Credentials, URLs, Env)',
      'Smart Paste — 클립보드 붙여넣기로 카드 자동 생성 (정규식 + AI)',
      'Fuse.js 키워드 검색 — 제목, 태그, 콘텐츠 통합 검색',
      '타입/태그 필터 & 다중 선택',
      'Markdown 에디터 미리보기 토글',
      'JSON 내보내기/가져오기 & 자동 백업 알림',
      '다크/라이트 테마 지원',
    ],
    type: 'major',
  },
]

export const CURRENT_VERSION = RELEASE_NOTES[0].version
