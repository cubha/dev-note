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
    version: 'v1.6.1',
    date: '2026-06-05',
    title: '좁은 화면 헤더 레이아웃 수정',
    highlights: [
      '창을 좁히면 탭 제목과 검색 영역이 겹치던 문제 수정',
      '좁은 화면에서 타입 필터가 \'필터\' 드롭다운으로 자동 접힘 — 탭과 검색을 가리지 않음',
    ],
    type: 'patch',
  },
  {
    version: 'v1.6.0',
    date: '2026-05-31',
    title: '카드 콘텐츠 암호화 & 커맨드 팔레트',
    highlights: [
      '카드 콘텐츠 암호화 — 설정 > 보안 탭에서 활성화. 패스프레이즈로 잠금, 앱 재시작 시 재입력 필요',
      '보안 탭 신설 — 환경설정 > 보안에서 암호화 활성화·비활성화·패스프레이즈 변경 가능',
      '커맨드 팔레트 — Mod+Shift+P로 명령 빠르게 실행, 검색으로 명령 찾기 및 단축키 확인 가능',
      '암호화 백업 — 암호화 상태로 내보내기·가져오기 가능, 암호화 파일 자동 감지',
    ],
    type: 'minor',
  },
  {
    version: 'v1.5.0',
    date: '2026-05-17',
    title: 'LLM 멀티 프로바이더 BYOK 확장',
    highlights: [
      'BYOK 지원 — 설정 > AI 탭에서 Anthropic·Google Gemini·OpenAI API 키 직접 입력, 일일 제한 없이 사용',
      '공유 키 AI 응답 품질 상향 — 모든 기능 모델 업그레이드',
      '잔여 횟수 실시간 표시 — 공유 키 사용 시 남은 횟수 + 진행 바 표시',
      'AI 설정 탭 신설 — 환경설정 > AI 탭에서 프로바이더 선택 및 키 관리',
    ],
    type: 'minor',
  },
  {
    version: 'v1.4.2',
    date: '2026-05-10',
    title: '탭 드래그 순서 변경 & 폴더 이동 개선',
    highlights: [
      '탭 드래그 순서 변경 — 탭을 드래그해 순서 재배치 가능',
      '폴더 계층 이동 — 폴더를 드래그해 다른 폴더 안으로 이동 가능',
      '카드 메뉴 버그 수정 — 메뉴 클릭이 카드 열기로 동작하던 문제 해결',
      '저장 단축키 재설정 시 실제 저장에 반영되지 않던 문제 수정',
      '일괄 삭제·폴더 이동 시 오류 처리 개선',
    ],
    type: 'patch',
  },
  {
    version: 'v1.4.1',
    date: '2026-05-08',
    title: '사이드바 리사이즈 & 반응형 레이아웃 & 접근성 개선',
    highlights: [
      '사이드바 드래그 리사이즈 — 오른쪽 가장자리 드래그로 너비 조절, 새로고침 후에도 유지',
      '모바일 화면 지원 — 작은 화면에서 햄버거 버튼으로 사이드바 열기',
      '접근성 개선 — 스크린리더 및 키보드 탐색 지원 강화',
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
      '카드 복제 — 우클릭 메뉴 > 복제로 카드 전체 복사',
      '정렬 드롭다운 — 최신순 / 오래된순 / 이름순 전환',
      '다중 선택 폴더 이동 — 선택한 카드를 다른 폴더로 일괄 이동',
    ],
    type: 'minor',
  },
  {
    version: 'v1.3.4',
    date: '2026-05-06',
    title: '검색 UX 개선 & 안정성',
    highlights: [
      '검색 초기화 개선 — X 버튼 클릭 시 타입·태그 필터 유지',
      '손상된 카드 데이터 안전하게 처리',
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.3',
    date: '2026-05-06',
    title: '버그 수정',
    highlights: [
      'Smart Paste 카드 타입 인식 오류 수정',
      '단축키 설정에서 Escape 키가 단축키로 등록되는 버그 수정',
      '선택 항목 내보내기 후 마지막 내보내기 일시 미갱신 수정',
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.2',
    date: '2026-05-06',
    title: '파비콘 교체',
    highlights: [
      '앱 파비콘을 DevNote D 로고로 교체 (브라우저 탭·작업표시줄에 반영)',
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
    ],
    type: 'patch',
  },
  {
    version: 'v1.3.0',
    date: '2026-03-21',
    title: '단축키 커스터마이징 & Note 카드',
    highlights: [
      '환경설정 > 단축키 탭 신설 — 14종 명령 키 재설정, 키 녹화, 충돌 감지, 브라우저 예약키 차단',
      'Markdown 카드 → Note 카드 이름 변경',
      '에디터 // 주석 하이라이팅 — 언어 모드 무관하게 시각적 강조',
    ],
    type: 'minor',
  },
  {
    version: 'v1.2.2',
    date: '2026-03-21',
    title: 'AI 안정성 개선',
    highlights: [
      'AI 기능 간헐적 오류 해결',
      'AI 호출 실패 시 자동 재시도 (최대 3회), 안정성 향상',
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
      'Smart Paste 응답 품질 향상',
    ],
    type: 'patch',
  },
  {
    version: 'v1.2.0',
    date: '2026-03-19',
    title: 'AI 공유 키 모드',
    highlights: [
      'AI 공유 키 모드 — API 키 설정 없이 AI 기능 사용 가능 (하루 일정 횟수 무료 제공)',
      '기능별 최적 AI 모델 자동 선택 (속도/품질 분리)',
      'AI 호출 실패 버그 수정',
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
      '5종 카드 타입 — Server, DB, API, Note, Document',
      '폴더 트리 & 드래그 앤 드롭 정렬',
      'Document 카드 — 5종 섹션 에디터 (메모, 코드, 접속정보, URL, 환경변수)',
      'Smart Paste — 클립보드 붙여넣기로 카드 자동 생성 (Claude AI)',
      '키워드 검색 — 제목, 태그, 콘텐츠 통합 검색',
      '타입·태그 필터 & 다중 선택',
      'Markdown 에디터 미리보기 토글',
      'JSON 내보내기/가져오기 & 자동 백업 알림',
      '다크/라이트 테마 지원',
    ],
    type: 'major',
  },
]

export const CURRENT_VERSION = RELEASE_NOTES[0].version
