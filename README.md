# DevNote

> SI 프리랜서를 위한 **AI 활용 프로젝트 메모 앱**
> 외부 서버 없이 브라우저 로컬 스토리지(IndexedDB)만 사용하는 무설치 웹 앱

---

## 📌 프로젝트 개요

NDA 보안 환경에서 일하는 SI 프리랜서를 위해 설계된 도구입니다.
**카드 기반 대시보드 + 탭 편집** 방식으로 접속 정보·노트·API 정보를 타입별로 구조화 관리합니다.

- **완전 로컬**: 모든 데이터는 브라우저 IndexedDB에만 저장
- **AI 활용 (선택적)**: Smart Paste(텍스트→구조화), 자연어 검색, 콘텐츠 요약, 시맨틱 검색 — Claude API BYOK
- **무설치**: 빌드 결과물을 브라우저에서 바로 실행 (GitHub Pages 배포)
- **6종 카드 타입**: Server, DB, API, Note, Custom + **Document** (다중 섹션 문서)

---

## 🛠 기술 스택

| 항목 | 선택 | 버전 |
|------|------|------|
| Framework | React + Vite (SPA) | React 19.2 / Vite 7.3 |
| Language | TypeScript Strict Mode | 5.9.3 |
| Data | Dexie.js (IndexedDB 래퍼) | 4.3 |
| State | Jotai (전역 UI 상태) + `useLiveQuery` (DB 반응형) | 2.18 / dexie-react-hooks 4.2 |
| Editor | CodeMirror 6 (`lang-json`, `lang-sql`) | 6.x |
| File I/O | File System Access API + `<input>` 폴백 | - |
| Search | Fuse.js (퍼지 검색) + Transformers.js (시맨틱 검색) | 7.1 / 3.8 |
| AI (선택적) | Claude API fetch 직접 호출 (BYOK, sessionStorage) | - |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` 플러그인) | 4.2 |
| DnD | @dnd-kit/core + @dnd-kit/sortable | 6.3 / 10.0 |
| Markdown | marked + DOMPurify | 17.0 / 3.3 |
| Icons | lucide-react | 0.577 |
| Toast | sonner | 2.0 |

> **Monaco Editor 미채택 이유**: 번들 크기 4MB+. SI 접속 정보 편집 수준엔 CodeMirror 6(~500KB)로 충분.

---

## 🤖 개발 체제

```
Claude Code → 분석, 설계(/plan), 구현, 검증(verify.sh) 전 과정 단독 수행
Gemini      → 외부 리서치 (라이브러리 비교, 트렌드 등) 필요 시 보조
```

> 2026-03-04 기준: Cursor 체제에서 Claude Code 단독 체제로 전환 완료

---

## 📁 프로젝트 구조

```
src/
├── core/
│   ├── db.ts              # Dexie v4 스키마 v10 + 마이그레이션
│   ├── types.ts           # CardField, StructuredContent, HybridContent, FIELD_SCHEMAS, TYPE_META
│   ├── content.ts         # parseContent, serializeContent, extractSearchText
│   ├── smart-paste.ts     # Tier 1 정규식 파서 + detectPatterns (패턴 힌트)
│   ├── ai.ts              # Tier 2 Claude API 래퍼 (smartPaste, naturalQuery, summarize, documentSmartPaste)
│   ├── ai-schemas.ts      # SMART_PASTE_SCHEMA, NATURAL_QUERY_SCHEMA, DOCUMENT_PASTE_SCHEMA
│   ├── duplicate-check.ts # 중복 host/url 경고
│   └── embeddings.ts      # Transformers.js 임베딩 엔진 (all-MiniLM-L6-v2)
├── features/
│   ├── sidebar/
│   │   ├── treeUtils.ts    # buildTree, getRootItems, collectDescendants
│   │   ├── TreeNode.tsx    # 재귀 폴더 트리, ItemRow, DnD 정렬, 인라인 이름 변경
│   │   └── Sidebar.tsx     # useLiveQuery, DnD 컨텍스트, 새 폴더/카드 버튼, 테마 토글
│   ├── cards/
│   │   ├── CardDetailEditor.tsx    # 탭 편집 (제목·타입·태그·CodeMirror, document→DocumentEditor 위임)
│   │   ├── CardFormModal.tsx       # 카드 생성 모달 (6종 타입, document Smart Paste)
│   │   ├── DocumentEditor.tsx      # document 전용 에디터 (DnD 섹션 정렬, Ctrl+S)
│   │   ├── SmartPastePanel.tsx     # Smart Paste UI (Tier 1/2 분기)
│   │   ├── CardFloatingView.tsx    # 카드 플로팅 뷰 (AI 요약)
│   │   ├── InfoCard.tsx            # 카드 그리드 단위 (DocumentPreview 포함)
│   │   ├── CardContent.tsx         # 카드 내 필드 표시
│   │   ├── FieldRow.tsx            # 필드 행 (복사 버튼 등)
│   │   ├── StructuredFieldInput.tsx # 구조화 필드 입력
│   │   ├── fieldHelpers.ts         # 필드 유틸 함수
│   │   └── sections/               # document 섹션 뷰 컴포넌트
│   │       ├── SectionWrapper.tsx          # 공통 헤더 (접기/드래그/삭제)
│   │       ├── CredentialSectionView.tsx   # 접속 정보 (마스킹/복사)
│   │       ├── UrlSectionView.tsx          # URL 목록
│   │       ├── EnvSectionView.tsx          # 환경변수 (secret 마스킹)
│   │       ├── CodeSectionView.tsx         # 코드 스니펫 (CodeMirror 6)
│   │       └── MarkdownSectionView.tsx     # 자유 텍스트
│   ├── dashboard/
│   │   ├── Dashboard.tsx        # 대시보드 뷰 (AppHeader + CardGrid/Editor 분기)
│   │   ├── AppHeader.tsx        # 3모드 검색 (keyword/AI/semantic) + 필터 + 탭 바
│   │   └── CardGrid.tsx         # 카드 그리드 레이아웃
│   ├── storage/
│   │   ├── schema.ts       # ExportSchema 타입 정의 + 유효성 검사
│   │   ├── export.ts       # 전체/선택 DB 덤프 → JSON (FSAA + Blob 폴백)
│   │   ├── import.ts       # JSON → DB Append/Replace (2-Pass 폴더 리매핑)
│   │   ├── ImportModeModal.tsx # 가져오기 모드 선택 모달
│   │   └── StorageButtons.tsx  # 내보내기/가져오기 UI 버튼
│   └── settings/
│       └── SettingsModal.tsx   # 환경설정 모달 (에디터 + AI 설정)
├── store/
│   ├── atoms.ts           # Jotai atoms (탭, AI, 검색모드, 시맨틱결과, 임베딩상태)
│   └── tabHelpers.ts      # openTab(), closeTab() 헬퍼 함수
└── shared/
    ├── components/
    │   └── ContextMenu.tsx  # 우클릭 메뉴 (이름 변경, 삭제)
    └── hooks/
        └── useGlobalKeyboardShortcuts.ts  # Ctrl+N, Ctrl+K, Ctrl+W, Del 등
```

---

## 🗄 데이터 스키마 (DB v10)

```
folders:    ++id, parentId, name, order
items:      ++id, folderId, title, *tags, type, order, pinned, updatedAt
embeddings: ++id, &itemId, updatedAt          # 시맨틱 검색용 벡터 저장
config:     id (단일 레코드, id=1 고정)
```

**카드 타입 6종**

| 타입 | 아이콘 | 콘텐츠 포맷 | 주요 필드 |
|------|--------|------------|-----------|
| Server | Terminal | StructuredContent | host, port, username, password, keyPath, note |
| DB | Database | StructuredContent | host, port, dbName, username, password, note |
| API | Globe | StructuredContent | url, method, apiKey, token, headers, note |
| Note | FileText | StructuredContent | content (자유 텍스트) |
| Custom | Puzzle | StructuredContent | content (자유 텍스트) |
| **Document** | **FileStack** | **HybridContent** | **다중 섹션 (markdown, credentials, urls, env, code)** |

### HybridContent — document 타입 전용 포맷

```typescript
interface HybridContent {
  format: 'hybrid'
  sections: AnySection[]  // 5종: MarkdownSection, CredentialSection, UrlSection, EnvSection, CodeSection
}
```

하나의 문서 안에 접속 정보 + URL + 환경변수 + 코드 + 메모를 섹션 단위로 조합 가능

---

## 🤖 AI 기능 (선택적 — API 키 없이도 앱 정상 동작)

모든 AI 기능은 **BYOK (Bring Your Own Key)** 방식. API 키는 `sessionStorage`에만 저장 (브라우저 닫으면 자동 소멸).

### 2-Tier 하이브리드 아키텍처

```
Tier 1 (오프라인, 0ms)  — 정규식 기반 패턴 감지 + 기본 구조화
Tier 2 (온라인, BYOK)   — Claude API Structured Outputs → 고정밀 구조화
```

### AI 기능 목록

| 기능 | Tier | 설명 |
|------|------|------|
| Smart Paste | 1+2 | 자유 텍스트 붙여넣기 → 카드 필드 자동 매핑 |
| Document Smart Paste | 1+2 | 자유 텍스트 → Section[] 구조화 (document 타입) |
| 자연어 검색 | 2 | "AWS 운영서버 접속 정보" → 구조화 쿼리 변환 → Fuse.js |
| 콘텐츠 요약 | 2 | 카드 내용 → 핵심 요약 + 키포인트 |
| 시맨틱 검색 | 로컬 | Transformers.js (all-MiniLM-L6-v2, 384차원) 벡터 유사도 |

### 검색 모드 3단계

```
keyword (기본)  → Fuse.js 퍼지 매칭
ai              → Claude API 자연어 → 구조화 쿼리 변환
semantic        → Transformers.js 임베딩 벡터 코사인 유사도
```

---

## 🗺 개발 로드맵

| 단계 | 내용 | 상태 |
|------|------|------|
| 1 | Vite + React 19, Dexie v4 스키마, Jotai atoms | ✅ 완료 |
| 2 | ~~마스터 패스워드 모달~~ (암호화 제거됨) | ✅ 완료 → 제거 |
| 3 | 사이드바 & 폴더 트리 (`useLiveQuery` + DnD 정렬) | ✅ 완료 |
| 4 | 탭 시스템 + CodeMirror 6 에디터 바인딩 | ✅ 완료 |
| 5 | CRUD 완성 + Ctrl+S 단축키 | ✅ 완료 |
| 6 | 환경설정 모달 (fontSize, wordWrap, tabSize) | ✅ 완료 |
| 7 | File I/O — 전체 내보내기/가져오기 (FSAA + 폴백) | ✅ 완료 |
| 8 | @dnd-kit DnD 정렬 + Fuse.js 검색 패널 | ✅ 완료 |
| 9 | 다중 선택 + 폴더 간 이동 | ✅ 완료 |
| 10 | 가져오기 Replace 모드 + 선택 내보내기 | ✅ 완료 |
| 11 | 다크/라이트 테마, 키보드 단축키 고도화 | ✅ 완료 |
| 12 | 카드 기반 대시보드 UI 재설계 (5종 타입, 구조화 데이터, 탭 편집) | ✅ 완료 |
| 13 | 암호화 제거, 앱 구조 간소화 (auth 모듈 삭제) | ✅ 완료 |
| 14 | AI Smart Paste (Tier 1 정규식 + Tier 2 Claude API) | ✅ 완료 |
| 15 | 3모드 검색 (keyword + AI 자연어 + 시맨틱), 콘텐츠 요약 | ✅ 완료 |
| 16 | Document 타입 — HybridContent, 5종 섹션, DocumentEditor, DnD 정렬 | ✅ 완료 |
| 17 | 추가 기능 (사이드바 리사이즈, 반응형, AppHeader 리팩토링 등) | 🔲 예정 |

---

## 📝 TODO

| # | 항목 | 요약 | 우선순위 | 상태 |
|---|------|------|---------|------|
| 1 | 다중 항목 선택 | Ctrl+Click, Shift+Click, Drag 선택 | P1 | ✅ 완료 |
| 2 | 폴더 간 이동 | 항목/폴더를 다른 폴더로 DnD 이동 | P0 | ✅ 완료 |
| 3 | 내보내기 전략 | 선택 내보내기 구현 | P2 | ✅ 완료 |
| 4 | Replace 가져오기 | 전체 가져오기 시 기존 데이터 대체 모드 | P0 | ✅ 완료 |
| 5 | 테마 | 다크/라이트 테마 전환 | P2 | ✅ 완료 |
| 6 | 카드 기반 UI 재설계 | 6종 타입 카드 대시보드, 구조화 데이터, 탭 편집 | P0 | ✅ 완료 |
| 7 | AI Smart Paste | Tier 1 정규식 + Tier 2 Claude API 구조화 | P1 | ✅ 완료 |
| 8 | 3모드 검색 | keyword + AI 자연어 + 시맨틱 (Transformers.js) | P1 | ✅ 완료 |
| 9 | Document 타입 | HybridContent, 5종 섹션 에디터, DnD 정렬 | P0 | ✅ 완료 |
| 10 | 사이드바 리사이즈 | 사이드바 너비 드래그 조절 | P3 | 🔲 예정 |
| 11 | 반응형 지원 | 모바일/태블릿 레이아웃 | P3 | 🔲 예정 |
| 12 | AppHeader 리팩토링 | 527줄 과부하 → 컴포넌트 분리 | P2 | 🔲 예정 |
| 13 | 테스트 코드 | Playwright E2E + 단위 테스트 | P2 | 🔲 예정 |

---

## 📋 변경 이력

> 최신 항목이 위에 위치

### 2026-03-08

**암호화 제거 + 앱 구조 간소화**
- `crypto.ts`, `MasterPasswordModal.tsx`, `features/auth/` 삭제
- 마스터 패스워드 없이 바로 앱 진입 (로컬 전용 앱에 불필요한 복잡도 제거)
- `encryptedContent`/`iv` 필드 → 평문 `content` 필드로 전환

**AI 기능 3계층 구현** (`core/ai.ts`, `core/ai-schemas.ts`, `core/smart-paste.ts`)
- Smart Paste: Tier 1(정규식 패턴) → Tier 2(Claude API Structured Outputs) 폴백
- 자연어 검색: Claude API → `{ searchTerms, typeFilter, tagFilter }` → Fuse.js
- 콘텐츠 요약: Claude API → `{ summary, keyPoints }` (CardFloatingView)
- BYOK 방식: API 키는 sessionStorage에만 저장, `anthropic-dangerous-direct-browser-access` 헤더

**시맨틱 검색** (`core/embeddings.ts`)
- Transformers.js `all-MiniLM-L6-v2` (q8, 384차원) 임베딩
- DB `embeddings` 테이블에 벡터 캐싱, 코사인 유사도 기반 검색
- AppHeader 3모드: keyword → ai → semantic 순환 토글

**Document 타입 + HybridContent** (`core/types.ts`, `features/cards/DocumentEditor.tsx`)
- 6번째 카드 타입 `document` 추가 — 다중 섹션 문서
- HybridContent: `{ format: 'hybrid', sections: AnySection[] }`
- 5종 섹션: markdown, credentials, urls, env, code
- DocumentEditor: @dnd-kit 섹션 DnD 정렬, 추가/삭제, Ctrl+S 저장
- Document Smart Paste: detectPatterns() 힌트 → Claude API Section[] 구조화

**섹션 뷰 컴포넌트** (`features/cards/sections/`) — 신규
- SectionWrapper: 공통 헤더 (접기/펼치기, 드래그 핸들, 제목 편집, 삭제)
- CredentialSectionView: 접속 정보 (category, 비밀번호 마스킹/복사)
- UrlSectionView: URL 목록 (외부링크, 복사)
- EnvSectionView: 환경변수 (secret 마스킹)
- CodeSectionView: CodeMirror 6 래핑 (언어 동적 전환)
- MarkdownSectionView: 자유 텍스트

**DB v10 마이그레이션** (`core/db.ts`)
- v8: 암호화 필드 제거 (encryptedContent → content)
- v9: embeddings 테이블 추가
- v10: items에 type 인덱스 추가

**대시보드 재구성** (`features/dashboard/`)
- TopBar + TabBar → AppHeader 통합 (3모드 검색 + 탭 바 + 필터)
- InfoCard: DocumentPreview (섹션 아이콘 + 항목 수 미리보기)
- CardGrid: document 타입 자동 지원

**버그 수정**
- Bug 1: dirty state 오판 — isProgrammaticRef + 원본값 비교 기반 dirty 판단
- Bug 3: 삭제 시 탭 열림 — removeItemsFromState 공용 함수화

### 2026-03-07

**카드 기반 대시보드 UI 재설계** (`features/cards/`, `features/dashboard/`) — 신규
- 5종 카드 타입 (Server, DB, API, Note, Custom) + 타입별 아이콘·액센트 컬러
- `CardGrid`: 대시보드 카드 그리드 뷰 (타입/태그 필터, 핀 고정 지원)
- `CardFormModal`: 타입 선택 그리드 카드 UI → 새 카드 생성 후 탭으로 열림
- `CardDetailEditor`: 활성 탭 편집 (제목·타입·태그·CodeMirror, Ctrl+S 저장)
- `TabBar` 이전: `features/editor/` → `features/dashboard/` (탭 관리 분리)

**구조화 데이터 포맷** (`core/types.ts`, `core/content.ts`) — 신규
- `StructuredContent`: `{ format: "structured", fields: CardField[] }`
- `parseContent`, `serializeContent`, `extractSearchText` 유틸 함수
- 레거시 텍스트 포맷 자동 감지 및 폴백 처리

**DB v7 마이그레이션** (`core/db.ts`)
- `ssh` → `server`, `http` → `api` 타입 자동 변환
- `pinned` 필드 추가, `LEGACY_TYPE_MAP`으로 가져오기 레거시 호환

**CodeMirror 테마 개선** (`features/cards/CardDetailEditor.tsx`)
- `oneDark` 테마 제거 → CSS 변수 기반 커스텀 테마로 교체
- 다크/라이트 모드 자동 대응 (배경·텍스트·커서·선택 영역 모두 CSS 변수 참조)

**탭 편집 TopBar 간소화**
- 상단 "탭 닫기·저장·삭제" 버튼 바 제거 → Ctrl+S, TabBar ✕ 버튼으로 대체

**공통 유틸 추가** (`shared/utils/`)
- `clipboard.ts`: 클립보드 복사 / `url.ts`: URL 유효성 검사

### 2026-03-05

**환경설정 모달** (`features/settings/SettingsModal.tsx`) — 신규
- 에디터 글꼴 크기(fontSize), 자동 줄바꿈(wordWrap), 탭 크기(tabSize) 설정
- AppConfig DB 연동, 변경 즉시 반영

**파일 내보내기/가져오기** (`features/storage/`) — 신규
- `schema.ts`: ExportSchema v1 정의 + 타입 가드 검증
- `export.ts`: 전체 DB 덤프 → JSON 파일 저장 (FSAA + Blob URL 폴백)
- `import.ts`: JSON → DB Append (2-Pass 폴더 parentId 리매핑, 트랜잭션 원자성)
- `StorageButtons.tsx`: 내보내기/가져오기 버튼 (사이드바 하단)

**DB 스키마 확장** (`core/db.ts`)
- v4 마이그레이션: AppConfig에 `editorFontSize`, `wordWrap`, `tabSize` 필드 추가
- `ensureConfig()` 초기화 함수로 AppConfig 안전 생성

**에디터 개선** (`features/editor/EditorPanel.tsx`)
- CodeMirror Compartment 패턴으로 fontSize/wordWrap/tabSize 동적 반영
- `configRef` 패턴: effect 내부에서 최신 config 참조 (무한 리렌더 방지)

**사이드바 개선** (`features/sidebar/`)
- @dnd-kit 기반 폴더/항목 DnD 순서 변경 구현
- DnD 핸들 hover 표시, 드래그 중 시각적 피드백

**Jotai atoms 확장** (`store/atoms.ts`)
- `appConfigAtom`, `settingsOpenAtom` 추가

**개발 체제 변경**
- Cursor → Claude Code 단독 체제로 전환
- `.claude/skills/` 스킬 파일 생성 (plan, verify)
- `.cursor/` 디렉토리 제거, 규칙은 CLAUDE.md로 이식

### 2026-03-02

**DB 스키마 확장** (`core/db.ts`)
- AppConfig에 `canaryBlock`, `canaryIv` 필드 추가 (패스워드 검증용)
- Dexie v2 마이그레이션: Item에 `order` 추가, v3 마이그레이션

**마스터 패스워드 모달** (`features/auth/MasterPasswordModal.tsx`)
- setup/unlock 모드, 네이티브 `<dialog>`, canaryBlock 검증

**App Barrier 패턴** (`App.tsx`)
- config/cryptoKey 기반 4분기 (로딩/setup/unlock/정상)

**사이드바** (`features/sidebar/`)
- treeUtils: `buildTree`, `getRootItems`, `collectDescendants`
- TreeNode: 재귀 폴더 트리, ItemRow, 인라인 이름 변경, 우클릭 컨텍스트 메뉴
- Sidebar: useLiveQuery, 새 폴더/항목 버튼

**에디터** (`features/editor/`)
- EditorPanel: CodeMirror 6, State Swapping, langCompartment, Ctrl+S
- TabBar: useLiveQuery, dirty dot, 닫기

**컨텍스트 메뉴** (`shared/components/ContextMenu.tsx`)
- 이름 변경, 폴더/항목 삭제 (collectDescendants)

---

## ⚠️ 알려진 이슈 및 특이사항

| 항목 | 내용 | 상태 |
|------|------|------|
| FSAA 브라우저 지원 | File System Access API는 Chrome/Edge 전용. Firefox 미지원 → `<input>` 폴백 항상 병행 | 폴백 구현 완료 |
| Tailwind v4 설정 | `tailwind.config.ts` 없음. `@tailwindcss/vite` 플러그인 전용 방식 | 정상 |
| AppHeader 과부하 | AppHeader.tsx 527줄 (탭+검색3모드+필터+임베딩) → 컴포넌트 분리 필요 | 리팩토링 예정 |
| AIService 비공유 | 인스턴스별 rate limit 비공유 → 싱글턴화 필요 | 리팩토링 예정 |
| 시맨틱 검색 성능 | 순차 await 병목 → 배치 처리 또는 Web Worker 이전 검토 | 리팩토링 예정 |
| Transformers.js 번들 | ort-wasm ~21MB (gzip ~5MB) → 초기 로드 시 지연 | 동적 로드로 완화 |
| 모바일 미지원 | 사이드바 240px 고정, 토글/반응형 없음 | TODO 예정 |
| 테스트 0건 | E2E/단위 테스트 미작성 | TODO 예정 |

---

## 🚀 로컬 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # dist/ 빌드
npm run lint      # ESLint 검사
```
