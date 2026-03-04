# Claude Code 운영 규칙: dev-note

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
│   ├── db.ts          # Dexie v4 스키마 & DB 인스턴스 (평문/암호화 필드 분리) — 수정 시 전체 영향도 필수 확인
│   └── crypto.ts      # Web Crypto API 유틸 (PBKDF2 키 파생, AES-GCM 암/복호화) — 수정 시 전체 영향도 필수 확인
├── features/
│   ├── sidebar/       # 폴더 트리, 항목 목록 (useLiveQuery 연동)
│   ├── editor/        # CodeMirror 6 에디터 래퍼, 탭 관리
│   ├── auth/          # 마스터 패스워드 모달, 잠금/해제 로직
│   └── storage/       # 파일 내보내기/가져오기, DB 덤프/복원
├── store/
│   └── atoms.ts       # Jotai atom 전용 — 전역 상태는 여기에만 정의
└── shared/
    ├── components/    # 공통 UI (Button, Modal, ContextMenu 등) — 수정 시 전체 feature 영향도 확인
    └── hooks/         # 공용 커스텀 훅
```

---

## 🧭 구현 원칙

- **최소 유추**: 확정되지 않은 기능을 자의적으로 유추하여 복잡하게 구현하지 않는다.
- **영향도 최소화**: 수정 전 연계 모듈을 분석하고 사이드이펙트 가능성을 먼저 보고한다.
- **CoT (Chain of Thought)**: 복잡한 로직은 구현 전 단계별 설계를 먼저 설명한다.
- **불확실성 명시**: 근거가 불확실한 경우 '불확실함'을 명시하고 추측성 구현을 지양한다.

---

## 🔐 보안 규칙

- **CryptoKey는 메모리(Jotai atom)에만** — IndexedDB, localStorage, sessionStorage 저장 절대 금지
- **마스터 패스워드는 저장하지 않는다** — PBKDF2 파생 키만 메모리에 유지, 새로고침 시 소멸이 정상 동작
- **민감 필드** (host, port, username, password, token, note 내용 등)는 반드시 `encryptedContent` 안에 포함
- **평문 허용 필드**: `title`, `tags`, `type`, `folderId`, `order`, `createdAt`, `updatedAt`
- 암호화/복호화는 반드시 `safeEncrypt` / `safeDecrypt` 사용 (암호화 비활성 상태 자동 처리)

---

## 📐 기술별 세부 규칙

### TypeScript
- `any` 타입 **절대 금지** — `unknown` 또는 명시적 타입 사용
- Strict Mode 준수 — null 체크 필수
- TypeScript 5.7+ `Uint8Array` → Web Crypto API 전달 시 캐스팅 필수:
  ```ts
  salt: hexToBuffer(saltHex) as unknown as ArrayBuffer
  ```

### Dexie v4
- 스키마 인덱스: 평문 필드만 선언 (`encryptedContent`, `iv` 제외)
  ```ts
  items: '++id, folderId, title, *tags, updatedAt'
  ```
- `useLiveQuery`는 컴포넌트 최상단에서 호출
- DB 마이그레이션 시 `version()` 번호 반드시 증가
- AppConfig 초기화는 `ensureConfig()` 사용 (직접 `db.config.get(1)` 호출 지양)

### 암호화 (Web Crypto API)
```ts
// ✅ 올바른 사용
const { encryptedContent, iv } = await safeEncrypt(cryptoKey, plaintext)
const plaintext = await safeDecrypt(cryptoKey, encryptedContent, iv)

// ❌ 금지
localStorage.setItem('key', ...)
await db.config.put({ cryptoKey: ... })
```

### File I/O
```ts
// File System Access API 우선, 폴백 필수
if ('showSaveFilePicker' in window) {
  // File System Access API 사용
} else {
  // 폴백: Blob URL 다운로드
  const url = URL.createObjectURL(blob)
}
```
- 폴백 없는 File System Access API 단독 사용 **금지**
- 가져오기 시 JSON 스키마 유효성 검사 필수
- 내보내기/가져오기 완료 후 `lastExportAt` 업데이트

### Jotai 상태 관리
- 전역 상태는 반드시 `src/store/atoms.ts`에 atom 정의
- 로컬 UI 상태는 `useState` 사용 (atom 남용 금지)
- `Set` 타입 atom 초기값은 명시적 제네릭 지정:
  ```ts
  atom<Set<number>>(new Set<number>())  // ✅
  atom<Set<number>>(new Set())          // ❌ 타입 추론 실패
  ```
- `dirtyItemsAtom`: 편집 시 ID 추가, Ctrl+S 저장 완료 시 ID 제거

### CodeMirror 6
- 언어 모드는 항목 `type`에 따라 동적으로 설정:
  - `'db'` → `sql()`, `'ssh'`/`'http'`/`'note'`/`'custom'` → `json()` 또는 기본 텍스트
- 탭 전환 시 에디터 인스턴스는 언마운트하지 않고 `display: none` 처리 (성능)
- Tailwind v4 `@layer` 내에서 `.cm-editor` 스타일 오버라이드

### Tailwind CSS v4
```ts
// vite.config.ts — v4 방식
import tailwindcss from '@tailwindcss/vite'
plugins: [react(), tailwindcss()]
```
```css
/* src/index.css — v4 방식 */
@import "tailwindcss";
```
- `tailwind.config.ts` 파일 **생성 금지** (v4에서 불필요)
- v3 방식(`@tailwind base/components/utilities`) **사용 금지**

---

## ⚠️ 알려진 특이사항

| 항목 | 내용 |
|---|---|
| TypeScript 5.7+ Uint8Array | `Uint8Array<ArrayBufferLike>`가 Web Crypto API의 `BufferSource`에 직접 할당 불가 → `as unknown as ArrayBuffer` 캐스팅 필수 (crypto.ts 참고) |
| File System Access API | Chrome/Edge 전용. Firefox 미지원 → `<input type="file">` 폴백 항상 병행 구현 |
| Tailwind CSS v4 | `@tailwindcss/vite` 플러그인 방식. `tailwind.config.ts` 파일 없음 — v3 방식 혼용 금지 |
| Dexie 암호화 필드 | `encryptedContent`, `iv`는 스키마 문자열에서 제외 (Dexie Best Practice) |
| Set<number> atom | Jotai에서 `new Set()` 초기값은 `new Set<number>()`로 명시적 타입 지정 필요 |

---

## ✅ 코드 품질

- 핵심 로직에 한글 주석 작성
- 임시/테스트 파일은 목적 달성 후 즉시 삭제
- 기능 완료 시 변경된 파일 목록 보고
- `useEffect` 내 `setState` 동기 호출 없음
- `tabStates` (Map) atom이 deps에 포함되어 무한 루프 발생하지 않는지 확인
- `exhaustive-deps` 경고 없음

---

## 🚫 프로젝트 금지 사항

- `any` 타입 사용
- `CryptoKey`를 IndexedDB, localStorage, sessionStorage에 저장
- 암호화 필드(`encryptedContent`, `iv`)를 Dexie 스키마 인덱스에 포함
- File System Access API 폴백 없는 단독 사용
- `tailwind.config.ts` 생성 (v4 방식에서 불필요)
- 외부 서버/API 호출 추가 (이 앱은 완전 로컬 오프라인 전용)
- 확정되지 않은 기능 자의적 추가
- 기술 스택 고정값 임의 변경
