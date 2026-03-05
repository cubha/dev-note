# DevNote

> SI 프리랜서를 위한 **로컬 기반 접속/환경 정보 관리 툴**
> 외부 서버 없이 브라우저 로컬 스토리지(IndexedDB)만 사용하는 무설치 웹 앱

---

## 📌 프로젝트 개요

NDA 보안 환경에서 일하는 SI 프리랜서를 위해 설계된 도구입니다.
Notepad++의 익숙한 탭 기반 편집 방식을 유지하면서, 최신 웹 기술로 보안과 UX를 대폭 개선합니다.

- **완전 로컬**: 모든 데이터는 브라우저 IndexedDB에만 저장. 외부 서버/API 호출 없음
- **AES-256 암호화**: 마스터 패스워드 기반 AES-GCM 암호화. 브라우저 내장 Web Crypto API 사용
- **무설치**: 빌드 결과물을 브라우저에서 바로 실행 (GitHub Pages 배포)
- **Notepad++ 대체**: 탭 시스템, 폴더 트리, 코드 하이라이팅 지원

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
│   ├── db.ts              # Dexie v4 스키마 (Folder, Item, AppConfig) + DB v1~v4 마이그레이션
│   └── crypto.ts          # Web Crypto API 유틸 (PBKDF2 키 파생, AES-GCM 암/복호화)
├── features/
│   ├── auth/
│   │   └── MasterPasswordModal.tsx  # 마스터 패스워드 모달 (setup/unlock)
│   ├── sidebar/
│   │   ├── treeUtils.ts    # buildTree, getRootItems, collectDescendants
│   │   ├── TreeNode.tsx    # 재귀 폴더 트리, ItemRow, DnD 정렬, 인라인 이름 변경
│   │   └── Sidebar.tsx     # useLiveQuery, DnD 컨텍스트, 새 폴더/항목 버튼
│   ├── editor/
│   │   ├── EditorPanel.tsx # CodeMirror 6, Compartment 동적 설정, Ctrl+S 저장
│   │   └── TabBar.tsx      # 탭 목록, dirty 표시, 닫기
│   ├── storage/
│   │   ├── schema.ts       # ExportSchema 타입 정의 + 유효성 검사
│   │   ├── export.ts       # 전체 DB 덤프 → JSON (FSAA + Blob 폴백)
│   │   ├── import.ts       # JSON → DB Append (2-Pass 폴더 리매핑)
│   │   └── StorageButtons.tsx  # 내보내기/가져오기 UI 버튼
│   └── settings/
│       └── SettingsModal.tsx   # 환경설정 모달 (fontSize, wordWrap, tabSize)
├── store/
│   └── atoms.ts           # Jotai atoms (탭, dirtyItems, cryptoKey, 사이드바, 검색, appConfig 등)
└── shared/
    ├── components/
    │   └── ContextMenu.tsx  # 우클릭 메뉴 (이름 변경, 삭제)
    └── hooks/
```

---

## 🗄 데이터 스키마 (DB v4)

### 하이브리드 암호화 전략

검색/정렬 성능과 보안을 동시에 만족시키기 위해 **메타데이터 평문 + 민감 데이터 암호화** 분리 방식 채택.

```
folders: ++id, parentId, name, order, createdAt
items:   ++id, folderId, title, *tags, order, updatedAt, encryptedContent(비인덱스), iv(비인덱스)
config:  id (단일 레코드, id=1 고정)
```

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
| 9 | 다중 선택 + 폴더 간 이동 | 🔲 예정 |
| 10 | 가져오기 Replace 모드 + 내보내기 전략 개선 | 🔲 예정 |
| 11 | UI/UX 고도화 (사이드바 리사이즈, 테마, 반응형 등) | 🔲 예정 |

---

## 📝 TODO (신규 — 2026-03-05)

> 상세 내용은 [`TODO.md`](./TODO.md) 참조

| # | 항목 | 요약 | 우선순위 |
|---|------|------|---------|
| 1 | 다중 항목 선택 | Ctrl+Click, Shift+Click, Drag 선택. `selectedItemsAtom` 신규 | P1 |
| 2 | 폴더 간 이동 | 항목/폴더를 다른 폴더로 DnD 이동. 현재 같은 부모 내 정렬만 가능 | P0 |
| 3 | 내보내기/가져오기 전략 | 개별 내보내기 검토, 암호화 항목 정책 결정 필요 | P2 |
| 4 | Replace 가져오기 | 전체 가져오기 시 기존 데이터 대체 모드 추가 | P0 |
| 5 | UI/UX 개선 | 사이드바 리사이즈, 라이트 테마, 검색 고도화, 반응형 | P3 |

**구현 순서**: TODO-4 → TODO-2 → TODO-1 → TODO-3 → TODO-5

---

## 📋 변경 이력

> 최신 항목이 위에 위치

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
| Import Append 중복 | 가져오기 시 중복 검사 없음 → 같은 파일 반복 가져오기 시 데이터 중복 | TODO-4로 해결 예정 |
| 모바일 미지원 | 사이드바 240px 고정, 토글/반응형 없음 | TODO-5 검토 예정 |

---

## 🚀 로컬 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # dist/ 빌드
npm run lint      # ESLint 검사
```
