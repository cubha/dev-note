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
- **AI (선택적)**: Vercel Edge Function(`api/v1/messages.ts`) 프록시 경유 Claude API 호출 (공유 키 모드)

---

## 📁 프로젝트 핵심 구조

```
src/
├── core/
│   ├── db.ts              # Dexie v4 스키마 v8 & DB 인스턴스
│   ├── types.ts           # CardField, StructuredContent, FIELD_SCHEMAS, TYPE_META
│   ├── content.ts         # parseContent, serializeContent, extractSearchText
│   ├── ai.ts              # Claude API fetch 래퍼 (Vercel Edge Function 공유 키 모드)
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
- **모델 설정** — 공유 키(anthropic)는 fast·quality 모두 `claude-sonnet-4-6` 단일 사용 (v1.2.x에서 Haiku→Sonnet 품질 상향, `DEFAULT_MODELS` in `core/ai.ts`). BYOK 멀티프로바이더 시에만 fast/quality 분기 존재(google=Gemini 2.5 Flash 단일, openai=GPT-4o-mini/GPT-4o). Edge Function 화이트리스트(`ALLOWED_MODELS`)엔 Haiku도 허용되나 클라이언트는 전송하지 않음

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

### 디자인 토큰 바인딩

> 규칙 자체(토큰이 Ground Truth·임의 값 금지·게이트가 강제)는 전역 `~/.claude/CLAUDE.md`
> 「🎨 디자인 토큰 재사용」에 있다. 여기엔 **이 프로젝트의 구체 바인딩 값만** 적는다.

| 항목 | 이 프로젝트의 값 |
|---|---|
| **Ground Truth 문서** | `docs/design/DESIGN-TOKENS.md` (이름 59/59 일치·값 불일치 0). ⚠️ `.gitignore`가 `docs/`를 제외하므로 **이 문서는 로컬 전용**이다 — 그래서 Spec 11/12의 활성 조건은 이 문서가 아니라 버전관리되는 토큰 실체(`src/index.css`)에 건다. GT 문서로 걸면 fresh clone·CI에서 규칙이 조용히 꺼진다 |
| **토큰 실체(단일 소스)** | `src/index.css` — `@layer base` 안의 `:root`(다크 기본) · `:root[data-theme="light"]` · `@media (max-width:768px)` 내부 `:root` |
| **값 형식** | hex + `rgba()` 리터럴. **채널삼중값(`50 13% 96%`)이 0개** |
| **소비 형태** | `var(--x)` **직접 소비** — `hsl()` 래핑 불필요·금지. Tailwind arbitrary property로 `bg-[var(--bg-app)]` 형태, 반복 조합은 `@layer components`의 유틸 클래스(`.btn-primary` `.subtle-btn` `.label-text` 등)로 승격 |
| **네임스페이스** | `--bg-*`(19) `--badge-*`(15) `--text-*`(13, 색상 전용) `--accent*`(3) `--border-*`(3) `--card-*`(3) `--transition-*`(3) `--modal-w-*`(4) `--font-*`(2, 폰트 크기 — `--text-*`와 분리) `--sidebar-width`(1) |
| **동적 조립** | 카드 타입 뱃지만 `var(--badge-${colorKey}-{bg,text,accent})` 형태로 조립한다. `colorKey`는 `src/core/types.ts`의 `TYPE_META` 5종(`server` `db` `api` `note` `document`)이며 정적 검사의 사각지대다 — **타입 추가 시 index.css에 3색 세트를 반드시 함께 추가**한다 |
| **예외 표기** | 같은 줄에 `design-lint-ignore` 주석 |

**게이트** (`verify.sh`):

| 게이트 | 등급 | 담당 |
|---|---|---|
| Spec 10 · 미정의 토큰 참조 | `fail` | `var(--x)`의 `--x`가 index.css에 없으면 브라우저가 선언을 **조용히 폐기**한다(tsc·eslint·빌드 전부 통과). 폴백 있는 참조·동적 조립은 구조적으로 제외 |
| Spec 11 · 하드코딩 hex | `warn` | 토큰 정의 파일은 제외 |
| Spec 12 · Tailwind arbitrary 값 | `warn` | 치수 토큰이 3개뿐이라 대부분 옮겨담을 타깃이 없다 → warn이 안정 상태 |
| design-lint | `fail` | `docs/design/prototype/*.html` 대상. **현재 대상 없음 → 런타임 자가 스킵**(조건부 생성 금지 규약상 블록은 상주) |

**현재 드리프트 실측** (2026-08-20, `bash verify.sh --full`):
- 미정의 토큰 참조 **0건**
- 하드코딩 hex **0건**
- ✅ **솔리드 파괴 버튼 3곳 통일** (2026-08-18) — `--bg-error-solid` 신설(다크 `#b83c2d` / 라이트 `#dc2626`) 후 `Sidebar:351` · `SecurityTab:360` · `ImportModeModal:156` 전부 이 토큰으로 교체. **`--text-error`를 배경 채움에 쓰던 역할 불일치가 원인**이었다 — 다크 `#f87171`은 흰 글씨 대비 **2.77:1로 AA 미달**이고, 혼자 정답이던 하드코딩 `#b83c2d`가 5.64:1이다. hover는 3곳 모두 `opacity-90`으로 통일. ⚠️ **`--bg-error-hover`(옅은 틴트)는 이 토큰의 짝이 아니다** — 흰 글씨가 판독 불가해진다
- ✅ **타이포·모달폭·버튼·팔레트 4종 정상화** (2026-08-20) — `--font-2xs/3xs`(11/10px) 신설로 `text-[10px]`(62) `text-[11px]`(11) 73곳 치환, `--modal-w-sm/md/lg/xl`(360/420/480/520px) 신설로 `Modal.tsx` width prop 4단계 토큰화, `.btn-primary-lg`·`.btn-danger`·`.btn-danger-lg` 신설로 settings/storage 6곳 공용 클래스 적용, `--text-on-solid`(#fff 고정, 테마 반전 없음) 신설로 `text-white`(21)·`bg-white`(2) 치환, `bg-black/50~70`(6) 전부 `--bg-overlay` 통일. **부수 발견·수정**: `Sidebar.tsx:378`·`ContextMenu.tsx:122,148`의 `hover:bg-error-hover + hover:text-white` 조합이 라이트 테마에서 대비 **1.1:1**(사실상 안 보임)이던 버그를 `hover:text-white` 제거로 해소(배경 hover만으로 신호 유지, 대비 4.43:1로 회복). Tailwind arbitrary **30파일/98줄 → 11파일/16줄**
- 팔레트 유틸 잔존 **10줄 / 19개소** — 전부 알파 변조(`bg-red-500/10` `border-yellow-500/40` 등 배너·뱃지 틴트). 대응하는 알파 틴트 토큰이 없어 **보류**. 해소하려면 시맨틱 틴트 토큰 세트(error/warning/success × bg/border)를 신설해야 하는데, 현재 렌더값과 동일하게 넣으면 테마 무관 상수라 토큰의 의미가 약하다 — **테마별 값을 정할 근거가 생길 때 착수**
- 남은 arbitrary 16줄 — `min-w/max-w/h-[Npx]` 계열 단발값(중복 0, 옮겨담을 반복 패턴 없음) + `text-[9px]` 1곳(단일 발생). warn 유지가 안정 상태

---

## 🚫 프로젝트 절대 금지

> 기술별 상세 규칙은 `## ⚙️ 기술별 구현 규칙` 참조.
> 아래는 예외 없이 적용되는 하드 바운더리만 나열한다.

- `any` 타입 사용
- File System Access API 폴백 없는 단독 사용
- `tailwind.config.ts` 생성
- API 키를 클라이언트(localStorage/sessionStorage/IndexedDB)에 저장
- AI 기능을 핵심 CRUD 경로의 필수 의존성으로 만드는 것
