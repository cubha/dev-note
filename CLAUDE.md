# Claude Code 운영 규칙: dev-note

> 전역 공통 규칙(워크플로우, SubTask 판단)은 `~/.claude/CLAUDE.md`를 따른다.
> 이 파일은 프로젝트 고유 내용만 기술한다.

---

## 🛠️ 프로젝트 기술 스택 (고정값 — 변경 금지)

- **Framework**: React 19 + Vite (SPA, 무설치 웹앱)
- **Data**: Dexie.js v4 (IndexedDB 래퍼, `useLiveQuery` 활용)
- **File I/O**: File System Access API (1순위) + `<input type="file">` 폴백 (Firefox 대응)
- **Editor**: CodeMirror 6 (`@codemirror/view`, `@codemirror/lang-json`, `@codemirror/lang-sql`)
- **State**: Jotai (전역 UI 상태) + `useLiveQuery` (DB 반응형 렌더링)
- **Search**: Fuse.js (클라이언트 사이드 퍼지 검색)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` 플러그인 방식 — v3 방식과 다름)
- **Language**: TypeScript Strict Mode (`any` 타입 금지)
- **AI (선택적)**: Cloudflare Workers 프록시 경유 Claude API 호출 (공유 키 모드, IP당 50회/일)

---

## 📁 프로젝트 핵심 구조

```
src/
├── core/
│   ├── db.ts              # Dexie v4 스키마 v8 & DB 인스턴스
│   ├── types.ts           # CardField, StructuredContent, FIELD_SCHEMAS, TYPE_META
│   ├── content.ts         # parseContent, serializeContent, extractSearchText
│   ├── ai.ts              # Claude API fetch 래퍼 (Cloudflare Workers 공유 키 모드)
│   └── ai-schemas.ts      # Smart Paste / Summary / Document Paste JSON Schema
├── features/
│   ├── sidebar/           # 폴더 트리, 항목 목록 (useLiveQuery 연동)
│   ├── cards/             # InfoCard, FieldRow, CardContent, CardFormModal, CardDetailEditor
│   ├── dashboard/         # AppHeader, CardGrid, Dashboard
│   ├── settings/          # SettingsModal
│   └── storage/           # 파일 내보내기/가져오기, DB 덤프/복원
├── store/
│   ├── atoms.ts           # Jotai atoms (탭, 사이드바, 검색, AI 상태)
│   └── tabHelpers.ts      # openTab(), closeTab() 헬퍼
└── shared/
    ├── components/        # 공통 UI (Button, Modal, ContextMenu 등)
    └── hooks/             # 공용 커스텀 훅
```

---

## 🧱 핵심 구현 원칙

- **최소 유추**: 확정되지 않은 기능을 자의적으로 유추하여 구현하지 않는다
- **영향도 최소화**: 수정 전 연계 모듈을 분석하고 사이드이펙트 가능성을 먼저 파악한다
- **CoT**: 복잡한 로직은 구현 전 단계별 설계를 한글로 먼저 작성한다
- **불확실성 명시**: 근거가 불확실한 경우 명시하고 추측성 구현을 지양한다
- **SubTask 순서 준수**: /plan으로 분리된 SubTask는 반드시 순서대로 하나씩 구현한다

---

## 🤖 AI 레이어 규칙

- **AI 기능은 완전 선택적(opt-in)** — API URL 미설정 시에도 앱의 모든 핵심 기능(카드 CRUD, 폴더, 검색, 내보내기)은 정상 동작
- **Vercel Edge Function 공유 키 단일 체제** — API 키는 Vercel 서버에서 관리, 클라이언트는 키를 보유하지 않음
- **API URL은 빌드 타임 환경변수** — `VITE_API_URL` (.env.local, gitignore)
- **Claude API fetch 직접 호출** — SDK 불필요, Vercel Edge Function 프록시가 인증 헤더 추가
- **모델 자동 분기** — Smart Paste·요약은 Haiku(속도·비용 우선), Document Smart Paste는 Sonnet(품질 우선)

---

## ⚙️ 기술별 구현 규칙

### TypeScript
- `any` 타입 절대 금지 — `unknown` 또는 명시적 타입 사용

### Dexie v4
- `useLiveQuery`는 컴포넌트 최상단에서 호출
- DB 마이그레이션 시 `version()` 번호 반드시 증가
- `ensureConfig()`로 AppConfig 초기화 (직접 `db.config.get(1)` 호출 지양)

### File I/O
- File System Access API 폴백 없는 단독 사용 금지
  ```ts
  if ('showSaveFilePicker' in window) { /* FSAA */ } else { /* Blob URL 폴백 */ }
  ```
- 가져오기 시 JSON 스키마 유효성 검사 필수
- 내보내기/가져오기 완료 후 `lastExportAt` 업데이트

### Jotai
- 전역 상태는 반드시 `src/store/atoms.ts`에 atom 정의
- 로컬 UI 상태는 `useState` 사용 (atom 남용 금지)
- `Set` 타입 atom 초기값은 명시적 제네릭 지정: `atom<Set<number>>(new Set<number>())`
- `dirtyItemsAtom`: 편집 시 ID 추가, Ctrl+S 저장 완료 시 ID 제거

### CodeMirror 6
- 언어 모드는 항목 `type`에 따라 동적으로 설정: `db` → `sql()`, 나머지 → `json()` 또는 기본 텍스트
- 탭 전환 시 에디터 인스턴스는 언마운트하지 않고 `display: none` 처리 (성능)

### Tailwind CSS v4
- `@tailwindcss/vite` 플러그인 방식, `tailwind.config.ts` 파일 생성 금지
- `@import "tailwindcss"` 방식 사용, v3 방식(`@tailwind base/components/utilities`) 금지

---

## 🚫 프로젝트 절대 금지

> 기술별 상세 규칙은 `## ⚙️ 기술별 구현 규칙` 참조.
> 아래는 예외 없이 적용되는 하드 바운더리만 나열한다.

- `any` 타입 사용
- File System Access API 폴백 없는 단독 사용
- `tailwind.config.ts` 생성
- API 키를 클라이언트(localStorage/sessionStorage/IndexedDB)에 저장
- AI 기능을 핵심 CRUD 경로의 필수 의존성으로 만드는 것
