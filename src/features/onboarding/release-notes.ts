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
