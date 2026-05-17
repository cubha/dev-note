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
    version: 'v1.5.0',
    date: '2026-05-17',
    title: 'LLM 멀티 프로바이더 BYOK 확장',
    highlights: [
      'BYOK 지원 — 설정 > AI 탭에서 Anthropic·Google Gemini·OpenAI API 키 직접 입력, 일일 제한 없이 사용',
      '공유 키 품질 상향 — 일일 한도 50→20회, 모든 기능 모델 Haiku → Sonnet으로 업그레이드',
      '잔여 횟수 실시간 표시 — SmartPaste·요약 패널 상단 배너 (남은 횟수 + 진행 바)',
      'AI 설정 탭 신설 — 환경설정에 AI 탭 추가 (Provider 선택, API Key 저장/지우기)',
      'DB v14 마이그레이션 — selectedProvider, userApiKey 필드 자동 추가',
    ],
    type: 'minor',
  },
  {
    version: 'v1.4.2',
    date: '2026-05-10',
    title: '탭 드래그 순서 변경 & 폴더 이동 개선 & 코드 품질 개선',
    highlights: [
      '탭 드래그 순서 변경 — TabBar에서 @dnd-kit으로 탭 순서 재배치 가능',
      '폴더 cross-parent 이동 — 폴더를 다른 부모 폴더 영역으로 드래그하면 계층 이동 (순환 참조 방지)',
      'InfoCard 컨텍스트 메뉴 버그 수정 — 메뉴 클릭이 카드 클릭으로 전파되던 문제 해결',
      'card.save 단축키 동적화 — 사용자 재맵핑 설정이 실제 저장에 반영되지 않던 문제 수정',
      'SECTION_META 상수 통합 — 섹션 아이콘·레이블·이모지 5파일 중복 정의 단일화',
      '일괄 삭제 / 폴더 이동 에러 처리 보강',
    ],
    type: 'patch',
  },
  {
    version: 'v1.4.1',
    date: '2026-05-08',
    title: '사이드바 리사이즈 & 반응형 레이아웃 & 접근성 강화',
    highlights: [
      '사이드바 드래그 리사이즈 — 오른쪽 가장자리 드래그로 너비 조절 (180~480px), 새로고침 후에도 유지',
      '반응형 모바일 레이아웃 — 768px 이하에서 햄버거 버튼 + 사이드바 오버레이 드로어',
      '접근성 강화 — role="tree", aria-pressed, aria-selected, aria-expanded 적용',
    ],
    type: 'patch',
  },
  {
    version: 'v1.4.0',
    date: '2026-05-08',
    title: 'Document 프리셋 & 코드 언어 확장 & 카드 복제/정렬',
    highlights: [
      'Document 섹션 프리셋 4종 — 카드 생성 시 빈 문서 / 서버 접속 / API 문서 / 레포 관리 템플릿 선택',
      'Code 섹션 언어 7종 추가 — yaml, python, javascript, typescript, html, css, dockerfile',
      '카드 복제 — 컨텍스트 메뉴 > 복제로 카드 deep copy (Document 섹션 ID 재발급)',
      '정렬 드롭다운 — 최신순 / 오래된순 / 이름순 전환',
      '다중 선택 폴더 이동 — 선택한 카드를 다른 폴더로 일괄 이동',
      'Vitest 단위 테스트 21개 추가 (content.ts 핵심 로직)',
    ],
    type: 'minor',
  },
  {
    version: 'v1.3.4',

    date: '2026-05-06',
    title: '코드 품질 개선 & CSS 유틸 클래스',
    highlights: [
      'parseContent 방어 검증 강화 — 손상 JSON 입력 시 안전 fallback',
      'SearchFilterBar X버튼 UX 수정 — 검색어만 초기화, 타입/태그 필터 유지',
      'DocumentEditor Smart Paste 파서 순수 함수 분리',
      'CSS 유틸 클래스 4종 추가 — .subtle-icon-btn, .menu-item-btn, .btn-primary, .section-label',
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.3',
    date: '2026-05-06',
    title: '버그 수정 & 리팩토링',
    highlights: [
      'Smart Paste 타입 스키마 오류 수정 — detectedType에서 폐기된 markdown 제거',
      '단축키 설정에서 Escape 키가 단축키로 등록되는 버그 수정',
      'exportSelectedItems() 완료 후 lastExportAt 미갱신 수정',
      'useMarkdownHtml 훅 추출, editorExtensions.ts 분리, NoteEditor/MarkdownEditorWithToggle 분리',
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.2',
    date: '2026-05-06',
    title: '파비콘 교체',
    highlights: [
      '앱 파비콘을 Vite 기본 아이콘에서 DevNote D 로고로 교체 (브라우저 탭·작업표시줄에 반영)',
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.1',
    date: '2026-03-25',
    title: 'Document View 개선 & 카드 DnD 순서 변경',
    highlights: [
      'Document View 접속 정보 주소 분리 — 호스트 / 사용자명 별도 행 표시 (각 복사 버튼)',
      '카드 그리드 DnD 순서 변경 — 드래그앤드롭으로 카드 배치 순서 변경, 새로고침 후에도 유지',
      '코드베이스 리팩토링 — 공통 컴포넌트 10종 추출, cn() 유틸리티, function → arrow 변환',
    ],
    type: 'patch',
  },
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
