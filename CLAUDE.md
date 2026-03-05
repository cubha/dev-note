# Claude Code 운영 규칙: dev-note

> 전역 공통 규칙(워크플로우, SubTask 판단)은 `~/.claude/CLAUDE.md`를 따른다.
> 이 파일은 프로젝트 고유 내용만 기술한다.

---

## 🛠️ 프로젝트 기술 스택 (고정값 — 변경 금지)

- **Framework**: React 19 + Vite (SPA, 무설치 웹앱)
- **Data**: Dexie.js v4 (IndexedDB 래퍼, `useLiveQuery` 활용)
- **File I/O**: File System Access API (1순위) + `<input type="file">` 폴백 (Firefox 대응)
- **Editor**: CodeMirror 6 (`@codemirror/view`, `@codemirror/lang-json`, `@codemirror/lang-sql`)
- **Security**: Web Crypto API 브라우저 내장 (AES-GCM 256bit + PBKDF2 SHA-256)
- **State**: Jotai (전역 UI 상태) + `useLiveQuery` (DB 반응형 렌더링)
- **Search**: Fuse.js (클라이언트 사이드 퍼지 검색)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` 플러그인 방식 — v3 방식과 다름)
- **Language**: TypeScript Strict Mode (`any` 타입 금지)

---

## 📁 프로젝트 핵심 구조

```
src/
├── core/
│   ├── db.ts          # Dexie v4 스키마 & DB 인스턴스 (평문/암호화 필드 분리)
│   └── crypto.ts      # Web Crypto API 유틸 (PBKDF2 키 파생, AES-GCM 암/복호화)
├── features/
│   ├── sidebar/       # 폴더 트리, 항목 목록 (useLiveQuery 연동)
│   ├── editor/        # CodeMirror 6 에디터 래퍼, 탭 관리
│   ├── auth/          # 마스터 패스워드 모달, 잠금/해제 로직
│   └── storage/       # 파일 내보내기/가져오기, DB 덤프/복원
├── store/
│   └── atoms.ts       # Jotai atoms (탭, 암호화 키, 사이드바, 검색 상태)
└── shared/
    ├── components/    # 공통 UI (Button, Modal, ContextMenu 등)
    └── hooks/         # 공용 커스텀 훅
```

---

## 🧱 핵심 구현 원칙

- **최소 유추**: 확정되지 않은 기능을 자의적으로 유추하여 구현하지 않는다
- **영향도 최소화**: 수정 전 연계 모듈을 분석하고 사이드이펙트 가능성을 먼저 파악한다
- **CoT**: 복잡한 로직은 구현 전 단계별 설계를 한글로 먼저 작성한다
- **불확실성 명시**: 근거가 불확실한 경우 명시하고 추측성 구현을 지양한다
- **SubTask 순서 준수**: /plan으로 분리된 SubTask는 반드시 순서대로 하나씩 구현한다

---

## 🔐 보안 규칙

- **CryptoKey는 메모리(Jotai atom)에만** — IndexedDB, localStorage, sessionStorage 저장 절대 금지
- **마스터 패스워드는 저장하지 않는다** — PBKDF2 파생 키만 메모리에 유지
- **민감 필드** (host, port, username, password, token, note 내용 등)는 반드시 `encryptedContent` 안에 포함
- **평문 허용 필드**: `title`, `tags`, `type`, `folderId`, `order`, `createdAt`, `updatedAt`

---

## ⚙️ 기술별 구현 규칙

### TypeScript
- `any` 타입 절대 금지 — `unknown` 또는 명시적 타입 사용
- TypeScript 5.7+ `Uint8Array<ArrayBufferLike>` → Web Crypto API 전달 시 캐스팅 필수:
  ```ts
  salt: hexToBuffer(saltHex) as unknown as ArrayBuffer
  ```

### Dexie v4
- `useLiveQuery`는 컴포넌트 최상단에서 호출
- DB 마이그레이션 시 `version()` 번호 반드시 증가
- 스키마 인덱스: 평문 필드만 선언, `encryptedContent`·`iv` 절대 포함 금지
- `ensureConfig()`로 AppConfig 초기화 (직접 `db.config.get(1)` 호출 지양)

### 암호화 (Web Crypto API)
- `safeEncrypt` / `safeDecrypt` 사용 (암호화 비활성 상태 자동 처리)
- `CryptoKey`는 `cryptoKeyAtom`(메모리)에만 — 새로고침 시 소멸이 정상 동작

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
- `tabStatesAtom` (`Map<number, EditorState>`)으로 탭별 Undo/Redo 히스토리 보존

### Tailwind CSS v4
- `@tailwindcss/vite` 플러그인 방식, `tailwind.config.ts` 파일 생성 금지
- `@import "tailwindcss"` 방식 사용, v3 방식(`@tailwind base/components/utilities`) 금지

---

## 🚫 프로젝트 절대 금지

> 기술별 상세 규칙은 `## ⚙️ 기술별 구현 규칙` 참조.
> 아래는 예외 없이 적용되는 하드 바운더리만 나열한다.

- `any` 타입 사용
- `CryptoKey`를 IndexedDB 또는 영구 스토리지에 저장
- 암호화 필드(`encryptedContent`)를 Dexie 인덱스에 노출
- File System Access API 폴백 없는 단독 사용
- `tailwind.config.ts` 생성
- 외부 서버/API 호출 추가 (완전 로컬 오프라인 전용)
