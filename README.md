# DevNote

> SI 프리랜서를 위한 **로컬 기반 접속/환경 정보 관리 툴**
> 외부 서버 없이 브라우저 로컬 스토리지(IndexedDB)만 사용하는 무설치 웹 앱

---

## 📌 프로젝트 개요

NDA 보안 환경에서 일하는 SI 프리랜서를 위해 설계된 도구입니다.
**카드 기반 대시보드 + 탭 편집** 방식으로 접속 정보·노트·API 정보를 타입별로 구조화 관리합니다.

- **완전 로컬**: 모든 데이터는 브라우저 IndexedDB에만 저장. 외부 서버/API 호출 없음
- **AES-256 암호화**: 마스터 패스워드 기반 AES-GCM 암호화. 브라우저 내장 Web Crypto API 사용
- **무설치**: 빌드 결과물을 브라우저에서 바로 실행 (GitHub Pages 배포)
- **5종 카드 타입**: Server(SSH/서버), DB(데이터베이스), API(HTTP), Note(자유 노트), Custom

---

## 🛠 기술 스택

| 항목 | 선택 | 버전 |
|------|------|------|
| Framework | React + Vite (SPA) | React 19.2 / Vite 7.3 |
| Language | TypeScript Strict Mode | 5.9.3 |
| Data | Dexie.js (IndexedDB 래퍼) | 4.3 |
| State | Jotai (전역 UI 상태) + `useLiveQuery` (DB 반응형) | 2.18 / dexie-react-hooks 4.2 |
| Editor | CodeMirror 6 (`lang-json`, `lang-sql`) | 6.x |
| Security | Web Crypto API (PBKDF2 + AES-GCM 256bit) | 브라우저 내장 |
| File I/O | File System Access API + `<input>` 폴백 | - |
| Search | Fuse.js (클라이언트 사이드 퍼지 검색) | 7.1 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` 플러그인) | 4.2 |
| DnD | @dnd-kit/core + @dnd-kit/sortable | 6.3 / 10.0 |
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
│   ├── db.ts              # Dexie v4 스키마 v7 (Folder, Item, AppConfig) + 마이그레이션
│   ├── crypto.ts          # Web Crypto API 유틸 (PBKDF2 키 파생, AES-GCM 암/복호화)
│   ├── types.ts           # CardField, StructuredContent, FIELD_SCHEMAS, TYPE_META
│   └── content.ts         # parseContent, serializeContent, extractSearchText
├── features/
│   ├── auth/
│   │   └── MasterPasswordModal.tsx  # 마스터 패스워드 모달 (setup/unlock)
│   ├── sidebar/
│   │   ├── treeUtils.ts    # buildTree, getRootItems, collectDescendants
│   │   ├── TreeNode.tsx    # 재귀 폴더 트리, ItemRow, DnD 정렬, 인라인 이름 변경
│   │   └── Sidebar.tsx     # useLiveQuery, DnD 컨텍스트, 새 폴더/카드 버튼, 테마 토글
│   ├── cards/
│   │   ├── CardDetailEditor.tsx # 활성 탭 카드 편집 (제목·타입·태그·CodeMirror)
│   │   ├── CardFormModal.tsx    # 카드 생성 모달 (타입 선택 그리드)
│   │   ├── InfoCard.tsx         # 카드 그리드 단위 컴포넌트
│   │   ├── CardContent.tsx      # 카드 내 필드 표시
│   │   ├── FieldRow.tsx         # 필드 행 (복사 버튼 등)
│   │   └── EmptyState.tsx       # 빈 상태 안내
│   ├── dashboard/
│   │   ├── Dashboard.tsx        # 대시보드 뷰 (TabBar+Editor 또는 TopBar+CardGrid)
│   │   ├── TopBar.tsx           # 검색·필터·새 카드 버튼 바
│   │   ├── CardGrid.tsx         # 카드 그리드 레이아웃
│   │   └── TabBar.tsx           # 열린 탭 목록 (타입 아이콘·dirty dot·닫기)
│   ├── storage/
│   │   ├── schema.ts       # ExportSchema 타입 정의 + 유효성 검사 (LEGACY_TYPE_MAP)
│   │   ├── export.ts       # 전체/선택 DB 덤프 → JSON (FSAA + Blob 폴백)
│   │   ├── import.ts       # JSON → DB Append/Replace (2-Pass 폴더 리매핑)
│   │   └── StorageButtons.tsx  # 내보내기/가져오기 UI 버튼
│   └── settings/
│       └── SettingsModal.tsx   # 환경설정 모달 (fontSize, wordWrap, tabSize)
├── store/
│   ├── atoms.ts           # Jotai atoms (openTabs, activeTab, dirtyItems, cryptoKey 등)
│   └── tabHelpers.ts      # openTab(), closeTab() 헬퍼 함수
└── shared/
    ├── components/
    │   └── ContextMenu.tsx  # 우클릭 메뉴 (이름 변경, 삭제)
    ├── utils/
    │   ├── clipboard.ts     # 클립보드 복사 유틸
    │   └── url.ts           # URL 유효성 검사 유틸
    └── hooks/
        └── useGlobalKeyboardShortcuts.ts  # Ctrl+N, Ctrl+K, Ctrl+W 등
```

---

## 🗄 데이터 스키마 (DB v7)

### 하이브리드 암호화 전략

검색/정렬 성능과 보안을 동시에 만족시키기 위해 **메타데이터 평문 + 민감 데이터 암호화** 분리 방식 채택.

```
folders: ++id, parentId, name, order
items:   ++id, folderId, title, *tags, type, order, pinned, updatedAt, encryptedContent(비인덱스), iv(비인덱스)
config:  id (단일 레코드, id=1 고정)
```

**카드 타입 5종** (v7: ssh → server, http → api 마이그레이션)

| 타입 | 아이콘 | 주요 필드 |
|------|--------|-----------|
| Server | Terminal | host, port, username, password, keyPath, note |
| DB | Database | host, port, dbName, username, password, note |
| API | Globe | url, method, apiKey, token, headers, note |
| Note | FileText | content (자유 텍스트) |
| Custom | Puzzle | content (자유 텍스트) |

| 분류 | 필드 | 저장 방식 |
|------|------|----------|
| 평문 (인덱싱/검색 대상) | `title`, `tags`, `type`, `folderId`, `order`, `createdAt`, `updatedAt` | Dexie 인덱스 |
| 암호화 (AES-GCM) | `encryptedContent` (host, port, username, password, 노트 본문 등) | Base64 암호문 |
| AppConfig 설정 | `editorFontSize`, `wordWrap`, `tabSize`, `saltHex`, `canaryBlock/Iv` | config 테이블 |

---

## 🔐 암호화 흐름

```
앱 진입
  └─ cryptoEnabled = true?
       └─ 마스터 패스워드 입력 모달
            └─ PBKDF2(SHA-256, 100,000 iterations) → AES-GCM 256bit CryptoKey
                 └─ cryptoKeyAtom (Jotai 메모리) 에만 저장
                      └─ 새로고침 시 자동 소멸 → 재입력 필요 (정상 동작)
```

---

## 🗺 개발 로드맵

| 단계 | 내용 | 상태 |
|------|------|------|
| 1 | Vite + React 19, Dexie v4 스키마, Web Crypto API 유틸, Jotai atoms | ✅ 완료 |
| 2 | 마스터 패스워드 모달 (`features/auth`) | ✅ 완료 |
| 3 | 사이드바 & 폴더 트리 (`useLiveQuery` + DnD 정렬) | ✅ 완료 |
| 4 | 탭 시스템 + CodeMirror 6 에디터 바인딩 | ✅ 완료 |
| 5 | CRUD 완성 + Ctrl+S 단축키 (암호화 저장) | ✅ 완료 |
| 6 | 환경설정 모달 (fontSize, wordWrap, tabSize) | ✅ 완료 |
| 7 | File I/O — 전체 내보내기/가져오기 (FSAA + 폴백) | ✅ 완료 |
| 8 | @dnd-kit DnD 정렬 + Fuse.js 검색 패널 | ✅ 완료 |
| 9 | 다중 선택 + 폴더 간 이동 | ✅ 완료 |
| 10 | 가져오기 Replace 모드 + 선택 내보내기 | ✅ 완료 |
| 11 | 다크/라이트 테마, 키보드 단축키 고도화 | ✅ 완료 |
| 12 | 카드 기반 대시보드 UI 재설계 (5종 타입, 구조화 데이터, 탭 편집) | ✅ 완료 |
| 13 | 추가 기능 (사이드바 리사이즈, 반응형 등) | 🔲 예정 |

---

## 📝 TODO (신규 — 2026-03-05)

> 상세 내용은 [`TODO.md`](./TODO.md) 참조

| # | 항목 | 요약 | 우선순위 | 상태 |
|---|------|------|---------|------|
| 1 | 다중 항목 선택 | Ctrl+Click, Shift+Click, Drag 선택. `selectedItemsAtom` | P1 | ✅ 완료 |
| 2 | 폴더 간 이동 | 항목/폴더를 다른 폴더로 DnD 이동 | P0 | ✅ 완료 |
| 3 | 내보내기 전략 | 선택 내보내기 구현 완료 | P2 | ✅ 완료 |
| 4 | Replace 가져오기 | 전체 가져오기 시 기존 데이터 대체 모드 | P0 | ✅ 완료 |
| 5 | 테마 | 다크/라이트 테마 전환 | P2 | ✅ 완료 |
| 6 | 카드 기반 UI 재설계 | 5종 타입 카드 대시보드, 구조화 데이터, 탭 편집 | P0 | ✅ 완료 |
| 7 | 사이드바 리사이즈 | 사이드바 너비 드래그 조절 | P3 | 🔲 예정 |
| 8 | 반응형 지원 | 모바일/태블릿 레이아웃 | P3 | 🔲 예정 |

---

## 📋 변경 이력

> 최신 항목이 위에 위치

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
| TS 5.9 `Uint8Array` | `Uint8Array<ArrayBufferLike>`가 Web Crypto API에 직접 할당 불가 → `as unknown as ArrayBuffer` 캐스팅 필요 | 우회 적용 |
| FSAA 브라우저 지원 | File System Access API는 Chrome/Edge 전용. Firefox 미지원 → `<input>` 폴백 항상 병행 | 폴백 구현 완료 |
| Tailwind v4 설정 | `tailwind.config.ts` 없음. `@tailwindcss/vite` 플러그인 전용 방식 | 정상 |
| ESLint `_` prefix | `varsIgnorePattern: '^_'` 미설정 → `{ id: _id, ...rest }` 패턴 사용 불가 | 명시적 필드 매핑 사용 |
| Import Append 중복 | 가져오기 시 중복 검사 없음 → 같은 파일 반복 가져오기 시 데이터 중복 | ✅ Replace 모드 도입으로 해결 |
| 모바일 미지원 | 사이드바 240px 고정, 토글/반응형 없음 | TODO-5 검토 예정 |

---

## 🚀 로컬 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # dist/ 빌드
npm run lint      # ESLint 검사
```
