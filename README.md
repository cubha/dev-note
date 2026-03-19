# DevNote

> 개발자를 위한 **정보 관리 대시보드**
> 외부 서버 없이 브라우저 로컬 스토리지(IndexedDB)만 사용하는 무설치 웹 앱

---

## 📌 프로젝트 개요

서버·DB·API 접속 정보부터 메모·문서까지, 개발에 필요한 모든 정보를 한 곳에서 관리하는 도구입니다.
**카드 기반 대시보드 + 탭 편집** 방식으로 접속 정보·노트·API 정보를 타입별로 구조화 관리합니다.

- **완전 로컬**: 모든 데이터는 브라우저 IndexedDB에만 저장
- **AI 활용 (선택적)**: Smart Paste(텍스트→구조화), 콘텐츠 요약 — Claude API BYOK
- **무설치**: 빌드 결과물을 브라우저에서 바로 실행 (GitHub Pages 배포)
- **5종 카드 타입**: Server, DB, API, Markdown, Document (다중 섹션 문서)

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
| Search | Fuse.js (키워드 퍼지 검색) | 7.1 |
| AI (선택적) | Claude API fetch 직접 호출 (BYOK, sessionStorage) | - |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` 플러그인) | 4.2 |
| DnD | @dnd-kit/core + @dnd-kit/sortable | 6.3 / 10.0 |
| Markdown | marked + DOMPurify | 17.0 / 3.3 |
| Icons | lucide-react | 0.577 |
| Toast | sonner | 2.0 |

---

## 📁 프로젝트 구조

```
worker/                    # Cloudflare Workers 프록시 (공유 키 모드)
│   ├── src/index.ts       # IP rate limit(KV) + Claude API 프록시
│   └── wrangler.toml      # Workers 설정
src/
├── core/
│   ├── db.ts              # Dexie v4 스키마 v12 + 마이그레이션
│   ├── types.ts           # CardField, StructuredContent, HybridContent, FIELD_SCHEMAS, TYPE_META
│   ├── content.ts         # parseContent, serializeContent, extractSearchText
│   ├── smart-paste.ts     # Tier 1 정규식 파서 + detectPatterns (패턴 힌트)
│   ├── ai.ts              # Tier 2 Claude API 래퍼 (smartPaste, summarize, documentSmartPaste)
│   ├── ai-schemas.ts      # SMART_PASTE_SCHEMA, SUMMARY_SCHEMA, DOCUMENT_PASTE_SCHEMA
│   └── duplicate-check.ts # 중복 host/url 경고
├── features/
│   ├── sidebar/
│   │   ├── treeUtils.ts    # buildTree, getRootItems, collectDescendants
│   │   ├── TreeNode.tsx    # 재귀 폴더 트리, ItemRow, DnD 정렬, 인라인 이름 변경
│   │   └── Sidebar.tsx     # useLiveQuery, DnD 컨텍스트, 새 폴더/카드 버튼, 테마 토글
│   ├── cards/
│   │   ├── CardDetailEditor.tsx    # 탭 편집 (제목·타입·태그·CodeMirror, document→DocumentEditor 위임)
│   │   ├── CardFormModal.tsx       # 카드 생성 모달 (5종 타입, document Smart Paste)
│   │   ├── DocumentEditor.tsx      # document 전용 에디터 (DnD 섹션 정렬, Ctrl+S)
│   │   ├── SmartPastePanel.tsx     # Smart Paste UI (Tier 1/2 분기)
│   │   ├── CardFloatingView.tsx    # 카드 플로팅 뷰 (AI 요약, HybridDocumentView)
│   │   ├── InfoCard.tsx            # 카드 그리드 단위 (DocumentPreview 포함)
│   │   ├── CardContent.tsx         # 카드 내 필드 표시
│   │   ├── FieldRow.tsx            # 필드 행 (복사 버튼 등)
│   │   ├── StructuredFieldInput.tsx # 구조화 필드 입력
│   │   ├── fieldHelpers.ts         # 필드 유틸 함수
│   │   └── sections/               # document 섹션 뷰 컴포넌트
│   │       ├── SectionWrapper.tsx          # 공통 헤더 (접기/드래그/삭제)
│   │       ├── CredentialSectionView.tsx   # 접속 정보 (마스킹/복사)
│   │       ├── UrlSectionView.tsx          # URL 목록 (메모카드 포함)
│   │       ├── EnvSectionView.tsx          # 환경변수 (secret 마스킹)
│   │       ├── CodeSectionView.tsx         # 코드 스니펫 (CodeMirror 6, 리사이즈)
│   │       └── MarkdownSectionView.tsx     # 자유 텍스트 (리사이즈 + 미리보기 토글)
│   ├── dashboard/
│   │   ├── Dashboard.tsx        # 대시보드 뷰 (AppHeader + CardGrid/Editor 분기)
│   │   ├── AppHeader.tsx        # 헤더 조합 래퍼 (TabBar + SearchFilterBar)
│   │   ├── TabBar.tsx           # 탭 목록 + 오버플로우 메뉴
│   │   ├── SearchFilterBar.tsx  # 키워드 검색 + 타입/태그 필터 + 공지 버튼
│   │   └── CardGrid.tsx         # 카드 그리드 레이아웃
│   ├── onboarding/
│   │   ├── AnnouncementModal.tsx   # 공지사항 + 릴리즈노트 모달
│   │   ├── GuideModal.tsx          # 사용 가이드 슬라이드 스테퍼
│   │   ├── announcement-utils.ts   # 24시간 dismiss 유틸 (localStorage)
│   │   ├── release-notes.ts        # 릴리즈노트 데이터
│   │   └── guide-steps.ts          # 가이드 슬라이드 데이터
│   ├── storage/
│   │   ├── schema.ts       # ExportSchema 타입 정의 + 유효성 검사 (LEGACY_TYPE_MAP)
│   │   ├── export.ts       # 전체/선택 DB 덤프 → JSON (FSAA + Blob 폴백)
│   │   ├── import.ts       # JSON → DB Append/Replace (2-Pass 폴더 리매핑)
│   │   ├── ImportModeModal.tsx # 가져오기 모드 선택 모달
│   │   └── StorageButtons.tsx  # 내보내기/가져오기 UI 버튼
│   ├── settings/
│   │   └── SettingsModal.tsx   # 환경설정 모달 (에디터 + AI 설정)
│   └── ai/
│       └── AISettingsPanel.tsx # AI API 키 관리 패널
├── store/
│   ├── atoms.ts           # Jotai atoms (탭, AI, 검색, 대시보드, 온보딩)
│   └── tabHelpers.ts      # openTab(), closeTab() 헬퍼 함수
└── shared/
    ├── components/
    │   └── ContextMenu.tsx  # 우클릭 메뉴 (이름 변경, 삭제)
    ├── hooks/
    │   ├── useGlobalKeyboardShortcuts.ts  # Ctrl+N, Ctrl+K, Ctrl+W, Del 등
    │   ├── useClickOutside.ts             # 외부 클릭 감지
    │   └── useResizableHeight.ts          # 드래그 리사이즈
    └── utils/
        ├── clipboard.ts    # 클립보드 복사
        ├── url.ts          # URL 유효성 검사 (isSafeUrl)
        └── highlight.tsx   # 검색 키워드 하이라이트
```

---

## 🗄 데이터 스키마 (DB v12)

```
folders:    ++id, parentId, name, order
items:      ++id, folderId, title, *tags, type, order, pinned, updatedAt
config:     id (단일 레코드, id=1 고정)
```

**카드 타입 5종**

| 타입 | 아이콘 | 콘텐츠 포맷 | 주요 필드 |
|------|--------|------------|-----------|
| Server | Terminal | StructuredContent | host, port, username, password, keyPath, note |
| DB | Database | StructuredContent | host, port, dbName, username, password, note |
| API | Globe | StructuredContent | url, method, apiKey, token, headers, note |
| Markdown | FileText | StructuredContent | content (자유 텍스트, 미리보기 토글) |
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

## ✨ 주요 기능

### 카드 관리
- **5종 카드 타입**으로 서버, DB, API, 메모, 문서를 체계적으로 관리
- **폴더 트리** 계층 구조 + **태그** 횡단 분류
- **드래그 앤 드롭** 정렬 및 폴더 간 이동
- **다중 선택** (Ctrl+Click, Shift+Click) 및 일괄 작업

### 검색 & 필터
- **Fuse.js 키워드 검색** — 제목, 태그, 콘텐츠 통합 퍼지 매칭
- **타입/태그 필터** 조합

### 에디터
- **CodeMirror 6** 기반 코드 에디터 (JSON, SQL 언어 모드)
- **Markdown 미리보기** 토글 (소스/스플릿)
- **Document 섹션 편집** — DnD 정렬, 섹션별 접기/펼치기, 리사이즈, 섹션별 Smart Paste, 메모(markdown) 섹션 소스/미리보기 토글
- **저장 버튼** — 헤더에 상시 표시 (dirty 상태 연동, Ctrl+S 병행)

### 백업 & 데이터
- **JSON 내보내기/가져오기** (전체/선택, Append/Replace 모드)
- **File System Access API** + `<input>` 폴백 (Firefox 대응)
- **자동 백업 알림** — 7일 경과 또는 미백업+10건 이상 시 toast 알림
- **IndexedDB 영속 스토리지** (navigator.storage.persist)

### UI/UX
- **다크/라이트 테마** 전환
- **사이드바 접기/펼치기** — 헤더 접기 버튼 + hover 핸들로 복원
- **탭 기반 편집** — 다중 탭 동시 편집, Ctrl+S 저장
- **키보드 단축키** — Ctrl+N(새 카드), Ctrl+K(검색), Ctrl+W(탭 닫기), Del(삭제)
- **공지사항 & 사용 가이드** — 초회 접근 시 자동 표시

---

## 🤖 AI 기능 (선택적 — API 키 없이도 앱 정상 동작)

API 키는 `sessionStorage`에만 저장 (브라우저 닫으면 자동 소멸). 두 가지 방식 지원:

- **BYOK** — 개인 Claude API 키 직접 입력 (무제한)
- **공유 키 모드** — 빌드에 Cloudflare Worker URL 포함 시 키 없이 사용 가능 (IP당 50회/일)

### 2-Tier 하이브리드 아키텍처

```
Tier 1 (오프라인, 0ms)  — 정규식 기반 패턴 감지 + 기본 구조화
Tier 2 (온라인, BYOK/공유)  — Claude API Structured Outputs → 고정밀 구조화
  ├── Smart Paste / 요약  → claude-haiku-4-5  (속도·비용 우선)
  └── Document Smart Paste → claude-sonnet-4-6 (복잡 섹션 분류, 품질 우선)
```

| 기능 | Tier | 설명 |
|------|------|------|
| Smart Paste | 1+2 | 자유 텍스트 붙여넣기 → 카드 필드 자동 매핑 |
| MD Smart Paste | 1 | 자유 텍스트 → 마크다운 자동 변환 (리스트, 링크, 코드블록 등) |
| Document Smart Paste | 1+2 | 자유 텍스트 → Section[] 구조화 (document 타입) |
| 섹션별 Smart Paste | 1 | 각 섹션 타입에 맞는 텍스트 파싱 (env=KEY=VALUE, urls=URL추출 등) |
| 콘텐츠 요약 | 2 | 카드 내용 → 핵심 요약 + 키포인트 |

---

## 📝 TODO (v1.1+)

| # | 항목 | 요약 | 우선순위 |
|---|------|------|---------|
| 1 | Document 섹션 프리셋 | 카드 생성 모달에서 템플릿 선택 (빈 문서 / 서버 접속정보 / API 문서 / 레포 관리). Repository/계정 정보 관리는 CredentialSection+UrlSection 조합 프리셋으로 커버 | P1 |
| 2 | Code 섹션 언어 확장 | `LANGUAGES` 배열 4종 → yaml/python/js/ts/html/css/dockerfile 추가 + CodeMirror lang 패키지 동적 import | P2 |
| ~~3~~ | ~~AppHeader 리팩토링~~ | ~~387줄 단일 컴포넌트 → `TabBar`, `SearchFilterBar` 서브 컴포넌트 분리~~ ✅ | ~~P2~~ |
| 4 | 테스트 코드 | Vitest 단위 테스트 (smart-paste, content 직렬화) + Playwright E2E | P2 |
| 9 | 카드 복제 기능 | `InfoCard` 메뉴에 "복제" 옵션 추가 → 제목 `(복사)` 접미, Document 타입은 섹션 deep copy + nanoid 재발급 | P2 |
| 10 | 다중 선택 일괄 이동/태그 | 다중 선택 후 "폴더로 이동" 모달 + "태그 일괄 추가/제거" 액션. 사이드바 컨텍스트 메뉴 또는 Ctrl+M 단축키 | P2 |
| 11 | 정렬 옵션 확장 | `SearchFilterBar` 우측에 정렬 드롭다운 추가 — 기본(order) / 수정일 / 생성일 / 제목 가나다순. `updatedAt` 인덱스 활용 | P2 |
| 5 | 사이드바 리사이즈 | 사이드바 우측 경계 drag으로 `--sidebar-width` CSS 변수 동적 조절 | P3 |
| 6 | 반응형 지원 | 모바일/태블릿 레이아웃 (사이드바 오버레이, 햄버거 메뉴) | P3 |
| 7 | 섹션 복제 기능 | `SectionWrapper` 메뉴에 "복제" 옵션 추가 (deep copy + nanoid 재발급) | P3 |
| 8 | Credential extra → textarea | `extra` 필드를 `textarea`로 교체 (SSH 키 등 멀티라인 데이터 지원) | P3 |
| 12 | 접근성(a11y) 강화 | 필터 버튼 `aria-pressed`, 태그 드롭다운 `role="listbox"`, 모달 `role="dialog" aria-modal` 추가 | P3 |
| 13 | 클립보드 자동 지우기 | 비밀번호·토큰 복사 후 10초 타이머로 `navigator.clipboard.writeText('')` 자동 호출 (보안 강화) | P3 |
| 14 | 내보내기 민감 필드 제외 | JSON 내보내기 시 password / apiKey / token 필드 제외 체크박스 옵션 추가 | P3 |
| 15 | DB 쿼리 성능 최적화 | `CardGrid` 전체 items 로드 → 타입 인덱스(`where('type')`) 활용 필터링, 태그 추출 쿼리 최적화 (대규모 데이터 10K+ 대응) | P3 |
| 16 | Markdown/Document 카드 그리드 표시 개선 | 카드 크기 고정 유지, 메모/문서 내용 미리보기가 잘려 보이는 문제 개선 — 텍스트 클리핑 최적화, 섹션 요약 표시 개선 | P2 |

---

## ⚠️ 알려진 이슈

| 항목 | 내용 |
|------|------|
| FSAA 브라우저 지원 | File System Access API는 Chrome/Edge 전용. Firefox → `<input>` 폴백 자동 적용 |
| 모바일 미지원 | 사이드바 240px 고정, 반응형 레이아웃 미구현 |

---

## 🚀 릴리즈 노트

### v1.2.0 (2026-03-19)

**AI API 키 개선**
- Claude API 모델 ID 수정 — Haiku 4.5 (`claude-haiku-4-5-20251001`) 올바른 버전으로 교체 (기존 잘못된 ID로 인한 키 검증 실패 버그 수정)
- Cloudflare Workers 공유 키 모드 추가 — 빌드에 Worker URL이 포함된 경우 개인 API 키 없이 AI 기능 사용 가능 (IP당 50회/일 rate limit)
- AI 모델 자동 분기 — Smart Paste·요약은 Haiku(속도 우선), Document Smart Paste는 Sonnet(품질 우선)으로 자동 선택

### v1.1.1 (2026-03-14)

**버그 수정**
- Smart Paste API 오탐 수정 — URL에 'api' 키워드가 포함된 경우 api 타입으로 오감지되던 문제 해결. curl 명령 / 인증 키 / HTTP 메서드+URL 조합이 있을 때만 api로 감지
- Markdown 카드 Smart Paste 타입 고정 — 텍스트 붙여넣기 시 타입 자동 감지가 markdown을 다른 타입으로 오인하던 문제 해결
- Document 카드 상단 컬러 테두리 누락 수정

**리팩토링**
- `AppHeader.tsx` 분리 — 단일 파일(387줄)을 `TabBar`, `SearchFilterBar` 서브 컴포넌트로 분리

### v1.1.0 (2026-03-11)

**MD Smart Paste 마크다운 변환**
- 자유 텍스트를 마크다운으로 자동 변환: `1)` `①` → 순서 리스트, `•▸` → 불릿 리스트, 독립 URL → 링크, 들여쓰기 → 펜스 코드블록, `===`/`___` → 구분선

**개선사항**
- 섹션별 Smart Paste — 각 섹션 헤더에 붙여넣기 버튼 추가 (타입별 자동 파싱)
- 사이드바 접기/펼치기 토글 추가
- Card Edit 저장 버튼 추가 (dirty 상태 연동)

**버그 수정**
- CapsLock 상태에서 Ctrl+S 저장 안 되던 오류 수정
- Document URL 섹션 라벨 입력 글씨 잘림 수정
- Document 메모 섹션에서 `1)`, `1.` 형식 텍스트가 View Modal에서 생략되던 오류 수정

### v1.0.0 (2026-03-10)

DevNote 첫 번째 정식 릴리즈

**핵심 기능**
- **5종 카드 타입** — Server, DB, API, Markdown, Document
- **Document 카드** — 5종 섹션 에디터 (Markdown, Code, Credentials, URLs, Env), DnD 섹션 정렬
- **폴더 트리 & 드래그 앤 드롭** — 계층 구조 관리, 폴더 간 이동
- **Smart Paste** — 클립보드 붙여넣기로 카드 자동 생성 (Tier 1 정규식 + Tier 2 Claude API)
- **Fuse.js 키워드 검색** — 제목, 태그, 콘텐츠 통합 퍼지 매칭
- **타입/태그 필터 & 다중 선택** — Ctrl+Click, Shift+Click 지원
- **탭 기반 편집** — 다중 탭 동시 편집, CodeMirror 6 에디터
- **Markdown 에디터 미리보기** — 소스/스플릿 토글
- **JSON 내보내기/가져오기** — 전체/선택, Append/Replace 모드, 자동 백업 알림
- **다크/라이트 테마** — 즉시 전환
- **AI 콘텐츠 요약** — Claude API BYOK (선택적)
- **공지사항 & 사용 가이드** — 초회 접근 시 자동 표시, 릴리즈노트

**보안**
- XSS 방지: URL 프로토콜 검증 (http/https만 허용)
- AI API 키 sessionStorage 전용 저장 (브라우저 종료 시 자동 소멸)
- IndexedDB 영속 스토리지 (navigator.storage.persist)

---

## 🚀 로컬 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # dist/ 빌드
npm run lint      # ESLint 검사
```

---

## 📜 라이선스

이 프로젝트는 [MIT License](./LICENSE)로 배포됩니다.
