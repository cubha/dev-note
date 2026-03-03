# Claude Code 운영 규칙: dev-note

> 전역 공통 규칙(3-AI 협업 구조, 워크플로우, SubTask 판단, Cursor 프롬프트 작성 원칙)은
> `~/.claude/CLAUDE.md`를 따른다. 이 파일은 프로젝트 고유 내용만 기술한다.

> ⚠️ **이 프로젝트 한정 예외**: Claude Code는 프로젝트 초기 세팅(보일러플레이트, 스키마, 핵심 유틸)에 한해
> 직접 코드를 작성할 수 있다. 그 외 일반 기능 구현은 Cursor에 위임한다.

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

## 🔐 보안 규칙

- **CryptoKey는 메모리(Jotai atom)에만** — IndexedDB, localStorage, sessionStorage 저장 절대 금지
- **마스터 패스워드는 저장하지 않는다** — PBKDF2 파생 키만 메모리에 유지
- **민감 필드** (host, port, username, password, token, note 내용 등)는 반드시 `encryptedContent` 안에 포함
- **평문 허용 필드**: `title`, `tags`, `type`, `folderId`, `order`, `createdAt`, `updatedAt`

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

## 🚫 프로젝트 추가 금지 사항

- 직접 코드 구현 및 파일 수정 (초기 세팅·검증·분석 목적 제외)
- `CryptoKey`를 IndexedDB 또는 영구 스토리지에 저장하는 구현 승인
- 암호화 필드(`encryptedContent`)를 Dexie 인덱스에 노출하는 스키마 승인
- 외부 서버/API 호출 추가 (이 앱은 완전 로컬 오프라인 전용)
