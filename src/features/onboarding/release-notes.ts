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
    version: 'v1.3.0',
    date: '2026-03-21',
    title: '단축키 커스터마이징 & Note 카드',
    highlights: [
      '환경설정 > 단축키 탭 신설 — 14종 명령 키 재설정, 키 녹화, 충돌 감지, 브라우저 예약키 차단',
      'Markdown 카드 → Note 카드 리네이밍 (DB v13 자동 마이그레이션)',
      '에디터 // 주석 하이라이팅 — 언어 모드 무관하게 시각적 강조',
    ],
    type: 'minor',
  },
  {
    version: 'v1.2.2',
    date: '2026-03-21',
    title: 'API 프록시 Vercel 마이그레이션',
    highlights: [
      'Cloudflare Worker → Vercel Edge Function 이전 — 간헐적 403 차단 문제 해결',
      '지수 백오프 + 지터 재시도 (최대 3회) — AI 호출 안정성 대폭 향상',
      '에러 리포트에 디버깅 정보(request-id, 재시도 횟수) 포함',
    ],
    type: 'patch',
  },
  {
    version: 'v1.2.1',
    date: '2026-03-19',
    title: 'AI Smart Paste 통합 & 삭제 확인',
    highlights: [
      '카드/폴더 삭제 시 확인 대화상자 표시',
      'Markdown Smart Paste — 자유 텍스트를 AI로 마크다운 정리',
      '개인 API 키(BYOK) 제거 — 공유 키 단일 체제로 전환',
      '정규식 파서 제거 — Smart Paste 전체를 AI 단일 호출로 통합',
    ],
    type: 'patch',
  },
  {
    version: 'v1.2.0',
    date: '2026-03-19',
    title: 'AI 공유 키 모드 & 모델 분기',
    highlights: [
      'Cloudflare Workers 공유 키 단일 체제 — API 키 설정 없이 AI 기능 사용 가능 (IP당 50회/일)',
      'AI 모델 자동 분기 — Smart Paste·요약은 Haiku(속도), Document Smart Paste는 Sonnet(품질)',
      'Claude Haiku 4.5 모델 ID 수정 — 기존 오류 ID로 인한 API 호출 실패 버그 수정',
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
      'Smart Paste — 클립보드 붙여넣기로 카드 자동 생성 (Claude AI)',
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
