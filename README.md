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

| 항목 | 선택 | 이유 |
|------|------|------|
| Framework | React 19 + Vite | SPA, 무설치 빌드에 최적 |
| Data | Dexie.js v4 (IndexedDB) | `useLiveQuery` 반응형 렌더링, 검색 인덱싱 |
| File I/O | File System Access API + `<input>` 폴백 | Chrome/Edge 1순위, Firefox 폴백 |
| Editor | CodeMirror 6 | 경량(~500KB), JSON/SQL 하이라이팅, Monaco 대비 번들 크기 1/8 |
| Security | Web Crypto API (브라우저 내장) | PBKDF2 키 파생 + AES-GCM 256bit, 외부 라이브러리 불필요 |
| State | Jotai | atom 단위 분리, 탭/에디터 상태 관리에 적합 |
| Search | Fuse.js | 클라이언트 사이드 퍼지 검색 |
| Styling | Tailwind CSS v4 | `@tailwindcss/vite` 플러그인 방식 (설정 파일 불필요) |
| DnD | @dnd-kit/core + @dnd-kit/sortable | React 생태계 표준 DnD (HTML5 DnD API 대비 상태 안정성 우수) |

> **Monaco Editor 미채택 이유**: 번들 크기 4MB+. SI 접속 정보 편집 수준엔 CodeMirror 6(~500KB)로 충분.

---

## 🤖 개발 체제

**Claude Code 단일 체제** (2026-03-04 전환)

```
Claude Code → 요구사항 분석, 설계(/plan), 코드 구현, 검증(verify.sh) 전 과정 담당
Gemini      → 깊은 기술 리서치 필요 시 보조 (무료, 선택적)
              예) 라이브러리 비교, API 트렌드, 레퍼런스 탐색
```

> 이전 3-AI 구조(Cursor 전담 구현)에서 Claude Code 단일 체제로 전환.

---

## 📁 프로젝트 구조

```
src/
├── core/
│   ├── db.ts          # Dexie v4 스키마 (folders, items, config)
│   └── crypto.ts      # Web Crypto API 유틸 (PBKDF2, AES-GCM)
├── features/
│   ├── auth/
│   │   └── MasterPasswordModal.tsx  # setup/unlock 모달
│   ├── sidebar/
│   │   ├── treeUtils.ts    # buildTree, getRootItems, collectDescendants
│   │   ├── TreeNode.tsx    # 재귀 폴더 트리, ItemRow, 인라인 이름 변경
│   │   └── Sidebar.tsx     # useLiveQuery, 새 폴더/항목 버튼
│   ├── editor/
│   │   ├── EditorPanel.tsx # CodeMirror 6, State Swapping, Ctrl+S
│   │   └── TabBar.tsx      # 탭 목록, dirty 표시, 닫기
│   ├── search/
│   │   └── SearchPanel.tsx  # Fuse.js 퍼지 검색 패널 (커맨드 팔레트)
│   └── storage/       # 파일 내보내기/가져오기 (예정)
├── store/
│   └── atoms.ts       # Jotai atoms (탭, tabStates, CryptoKey, contextMenu, renamingTarget 등)
└── shared/
    ├── components/
    │   └── ContextMenu.tsx  # 이름 변경, 폴더/항목 삭제
    └── hooks/
```

---

## 🗄 데이터 스키마

### 하이브리드 암호화 전략

검색/정렬 성능과 보안을 동시에 만족시키기 위해 **메타데이터 평문 + 민감 데이터 암호화** 분리 방식을 채택합니다.

```ts
// 평문 저장 (Dexie 인덱싱, 사이드바 렌더링, 검색 대상)
title, tags, type, folderId, order, createdAt, updatedAt

// 암호화 저장 (AES-GCM — host, port, username, password, 노트 본문 등)
encryptedContent: string   // Base64 암호문
iv: string                 // Base64 IV (복호화에 필요)
```

> `encryptedContent`, `iv`는 Dexie 스키마 인덱스에서 의도적으로 제외 (Dexie Best Practice)

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
| 3 | 사이드바 & 폴더 트리 (`useLiveQuery` 연동) | ✅ 완료 |
| 4 | 탭 시스템 + CodeMirror 6 에디터 바인딩 | ✅ 완료 |
| 5 | CRUD 완성 + Ctrl+S 단축키 (암호화 저장) | ✅ 완료 |
| 6 | Fuse.js 클라이언트 검색 패널 | ✅ 완료 |
| 7 | File I/O — 내보내기/가져오기 (File System Access API + 폴백) | 🔲 |
| 8 | @dnd-kit DnD 정렬 + 환경설정 모달 + GitHub Pages 배포 | 🔲 |

---

## 📋 변경 이력

> **추가 방법**: 새 작업 시 이 섹션 **맨 위**(아래 `### YYYY-MM-DD` 블록 바로 다음)에 날짜와 내용 추가

### 2026-03-04

**개발 체제 전환**
- 3-AI 협업 구조(Claude Code + Cursor + Gemini) → **Claude Code 단일 체제**로 전환
- `.cursor/rules/` 디렉토리 삭제 (Cursor 전용 규칙 파일 제거)
- `CLAUDE.md` 재정비: Cursor 위임 조항 제거, 구현 원칙·기술별 세부 규칙 추가
- `.claude/skills/plan`, `.claude/skills/verify` 스킬 업데이트
- `verify.sh` 메시지에서 Cursor 관련 문구 제거

**Fuse.js 검색 패널** (`features/search/SearchPanel.tsx` 신규)
- VSCode 커맨드 팔레트 스타일 — 화면 중앙 상단 fixed 오버레이
- 진입점: 사이드바 돋보기 버튼 + `Ctrl+F` 전역 단축키
- 검색 대상: `title` (가중치 0.8) + `tags` (가중치 0.2), threshold 0.4, `ignoreLocation: true`
- 결과 표시: 타입 뱃지 + 제목(매칭 하이라이트 `text-[#e5c07b]`) + 폴더 경로
- 키보드 UX: `↑↓` 탐색, `Enter` 탭 열기, `Esc` 닫기, 선택 항목 자동 스크롤
- Backdrop 클릭 닫기, 결과 선택 시 자동 닫힘 + `searchQuery` 초기화
- `App.tsx`: `<SearchPanel />` 마운트, Ctrl+F useEffect 추가
- `Sidebar.tsx`: 헤더에 검색 버튼 추가

---

### 2025-03-02

**DB 스키마 확장 (`db.ts`)**
- AppConfig에 `canaryBlock`, `canaryIv` 필드 추가 (패스워드 검증용 canary)
- Dexie version(2) 마이그레이션, Item에 `order` 추가 + version(3)

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

**Atoms** (`store/atoms.ts`)
- tabStatesAtom, contextMenuAtom, renamingTargetAtom

**버그 수정**
- TreeNode: set-state-in-effect → uncontrolled input
- ContextMenu: 중복 useEffect 제거
- EditorPanel: tabStatesRef로 무한 리렌더 방지

---

## 🚀 로컬 실행

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # dist/ 빌드
```

---

## ⚠️ 알려진 특이사항

| 항목 | 내용 |
|------|------|
| TypeScript 5.7+ `Uint8Array` | `Uint8Array<ArrayBufferLike>`가 Web Crypto API `BufferSource`에 직접 할당 불가 → `as unknown as ArrayBuffer` 캐스팅 필요 |
| File System Access API | Chrome/Edge 전용. Firefox 미지원 → `<input type="file">` 폴백 항상 병행 구현 |
| Tailwind CSS v4 | `tailwind.config.ts` 파일 없음. `@tailwindcss/vite` 플러그인 방식 전용 |
| DnD | HTML5 Drag and Drop API는 React에서 드래그 중 상태 동기화 불안정 → `@dnd-kit` 사용 |
