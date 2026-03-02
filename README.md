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

## 🤖 3-AI 협업 개발 구조

```
Gemini      → 외부 리서치 (라이브러리 비교, 트렌드, 레퍼런스 탐색)
Claude Code → 분석, 설계, SubTask 분리, Cursor 구현 프롬프트 작성, 코드 검증
Cursor AI   → 실제 코드 구현 전담
```

---

## 📁 프로젝트 구조

```
src/
├── core/
│   ├── db.ts          # Dexie v4 스키마 (folders, items, config)
│   └── crypto.ts      # Web Crypto API 유틸 (PBKDF2, AES-GCM)
├── features/
│   ├── auth/          # 마스터 패스워드 모달, 잠금/해제
│   ├── sidebar/       # 폴더 트리, 항목 목록 (useLiveQuery)
│   ├── editor/        # CodeMirror 6 에디터 래퍼, 탭 관리
│   └── storage/       # 파일 내보내기/가져오기
├── store/
│   └── atoms.ts       # Jotai atoms (탭, CryptoKey 세션, 검색 등)
└── shared/
    ├── components/    # 공통 UI (Button, Modal, ContextMenu)
    └── hooks/         # 공용 커스텀 훅
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
| 2 | 마스터 패스워드 모달 (`features/auth`) | 🔲 |
| 3 | 사이드바 & 폴더 트리 (`useLiveQuery` 연동) | 🔲 |
| 4 | 탭 시스템 + CodeMirror 6 에디터 바인딩 | 🔲 |
| 5 | CRUD 완성 + Ctrl+S 단축키 (암호화 저장) | 🔲 |
| 6 | Fuse.js 클라이언트 검색 패널 | 🔲 |
| 7 | File I/O — 내보내기/가져오기 (File System Access API + 폴백) | 🔲 |
| 8 | @dnd-kit DnD 정렬 + 환경설정 모달 + GitHub Pages 배포 | 🔲 |

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
