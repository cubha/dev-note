# Claude Code 운영 규칙: dev-note

## 🤖 3-AI 협업 구조 및 역할

| AI | 역할 |
|------|------|
| **Claude Code (나)** | 프로젝트 분석, SubTask 분리, Cursor 프롬프트 작성, 코드 검증 — **메인 컨트롤러** |
| **Cursor AI** | 실제 코드 구현 전담 |
| **Gemini** | 외부 리서치 전용 (최신 라이브러리 비교, 트렌드 조사, 레퍼런스 탐색) |

> ⚠️ Claude Code는 **직접 코드를 구현하지 않는다.** 분석, 설계, 지시문 작성, 검증에만 집중한다.
> 단, 프로젝트 초기 세팅(보일러플레이트, 스키마, 핵심 유틸)은 예외적으로 직접 작성한다.

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

## 🔁 표준 워크플로우

```
1. 사용자 → Claude에게 Task 설명
2. Claude → 프로젝트 파일 직접 분석
3. Claude → Task / SubTask 자동 판단 후 Cursor 프롬프트 작성
4. 사용자 → Cursor에 프롬프트 전달 → 구현
5. 사용자 → Claude에게 결과 코드/경로 공유
6. Claude → 검증 체크리스트 기반 리뷰
7. 문제 발견 시 → 수정 프롬프트 재작성 후 4번 반복
※ 외부 리서치 필요 시 → Gemini 호출 후 결과를 Claude에 전달
```

---

## ✂️ SubTask 자동 판단 원칙

### 단일 Task로 처리
- 수정 파일 2개 이하
- 단일 feature 내 변경
- 기존 로직의 버그 수정 또는 소규모 개선

### SubTask로 분리
아래 조건 중 하나라도 해당하면 자동 분리한다.

- 수정 파일 3개 이상
- Dexie 스키마 변경 + 컴포넌트 구현이 동시에 필요한 경우
- 신규 feature 디렉토리 생성이 포함된 경우
- 서로 다른 레이어(DB → store → component → shared)를 순서대로 작업해야 하는 경우

**SubTask 분리 포맷:**
```
[Task] 기능명
  ├── SubTask 1: Dexie 스키마/타입 정의  → src/core/db.ts
  ├── SubTask 2: 암호화 유틸 수정        → src/core/crypto.ts
  ├── SubTask 3: Jotai atom 추가         → src/store/atoms.ts
  ├── SubTask 4: feature 로직/훅 구현    → src/features/*/
  └── SubTask 5: 공통 UI 컴포넌트        → src/shared/components/
```

---

## 🎭 페르소나 정의표

Cursor 프롬프트 작성 시 작업 유형에 맞는 페르소나를 선택해 첫 줄에 명시한다.

| 작업 유형 | 페르소나 |
|---|---|
| UI 컴포넌트 구현 | 시니어 React + Tailwind CSS 프론트엔드 개발자 |
| Dexie 스키마 / 타입 정의 | 시니어 IndexedDB + Dexie.js v4 아키텍트 |
| 암호화 로직 구현 | 시니어 Web Crypto API 보안 개발자 |
| Jotai 상태 관리 | 시니어 React 상태관리 아키텍트 |
| CodeMirror 에디터 | 시니어 CodeMirror 6 통합 개발자 |
| 파일 I/O 구현 | 시니어 File System Access API 개발자 |
| Fuse.js 검색 | 시니어 클라이언트사이드 검색 개발자 |
| 버그 수정 | 시니어 디버거 (최소 변경 원칙) |
| 성능 최적화 | 시니어 React 렌더링 최적화 전문가 |

---

## 📝 Cursor 프롬프트 작성 원칙

### 컨텍스트 범위 (필수 명시)
```
컨텍스트 범위: [@파일경로 2~3개만 지정 권장]
```
> Cursor는 컨텍스트가 넓을수록 노이즈가 증가함. 관련 파일만 지정.

### 프롬프트 내부 필수 구성 요소 (순서 고정)

1. **페르소나**: 위 정의표에서 작업 유형에 맞는 페르소나 1줄 명시
2. **형식 제약**: "코드 블록 형식으로만 출력해"
3. **수정 대상**: 참조할 `@파일경로` 명시
4. **작업 내용**: 구현/수정할 내용을 섹션(`##`)으로 명확히 구분
5. **완료 조건**: ⚠️ **항상 출력** — 구현 완료 상태를 구체적으로 기술
6. **금지 사항**: 건드리면 안 되는 파일/로직/타입 명시

### 프롬프트 템플릿

````
컨텍스트 범위: @파일경로1 @파일경로2

[작업 유형에 맞는 페르소나]로서, 아래 요구사항을 구현해줘.
코드 블록 형식으로만 출력해.

## 수정 대상
@파일경로

## 작업 내용
(구체적인 구현 내용)

## 완료 조건
- (완료 상태를 구체적으로 기술)

## 금지 사항
- (건드리면 안 되는 파일/로직)
- any 타입 사용 금지
- 암호화되지 않은 민감 필드를 Dexie 인덱스에 노출 금지
````

---

## ✅ 코드 검증 체크리스트

### TypeScript
- [ ] `any` 타입 미사용 (`unknown` 또는 명시적 타입 사용)
- [ ] TypeScript 5.7+ `Uint8Array<ArrayBufferLike>` → Web Crypto API 전달 시 `as unknown as ArrayBuffer` 캐스팅 여부
- [ ] Strict Mode 위반 없음 (null 체크 포함)

### Dexie v4
- [ ] `encryptedContent`, `iv` 등 암호화 필드는 스키마 인덱스에서 제외되어 있는지
- [ ] `useLiveQuery` 훅은 컴포넌트 최상단에서 호출되는지
- [ ] DB 마이그레이션 필요 시 `version()` 버전 번호 증가 여부

### 암호화 (Web Crypto API)
- [ ] `CryptoKey`는 `cryptoKeyAtom` (메모리)에만 저장, IndexedDB/localStorage에 저장 금지
- [ ] 평문 노출이 허용된 필드: `title`, `tags`, `type` — 나머지는 `encryptedContent`에 포함
- [ ] `safeEncrypt` / `safeDecrypt` 사용 (암호화 비활성 상태 자동 처리)
- [ ] 새로고침 시 `CryptoKey` 소멸 → 마스터 패스워드 재입력 흐름 보장 여부

### File I/O
- [ ] File System Access API 미지원 브라우저 폴백(`<input type="file">`) 처리 여부
- [ ] 내보내기 JSON 스키마 유효성 검사 포함 여부 (가져오기 시)
- [ ] `lastExportAt` 업데이트 여부

### CodeMirror 6
- [ ] 언어 모드는 항목 `type`에 따라 동적으로 설정 (`json` / `sql` / `text`)
- [ ] 에디터 인스턴스는 탭 전환 시 언마운트되지 않고 hidden 처리하는지 (성능)

### Jotai
- [ ] 전역 상태는 반드시 `src/store/atoms.ts`에 정의
- [ ] 로컬 UI 상태는 `useState` 사용 (atom 남용 금지)
- [ ] `dirtyItemsAtom` 업데이트 — 편집 시 추가, Ctrl+S 저장 완료 시 제거 여부

### 사이드 이펙트
- [ ] `shared/components/` 수정 시 전체 feature 영향도 확인
- [ ] Dexie 스키마 변경 시 기존 데이터 마이그레이션 처리 여부

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

## 🚫 금지 사항

- 직접 코드 구현 및 파일 수정 (초기 세팅·검증·분석 목적 제외)
- 확정되지 않은 기능 자의적 추가 제안
- 기술 스택 고정값 임의 변경 제안
- `CryptoKey`를 IndexedDB 또는 영구 스토리지에 저장하는 구현 승인
- 암호화 필드(`encryptedContent`)를 Dexie 인덱스에 노출하는 스키마 승인
- 외부 서버/API 호출 추가 (이 앱은 완전 로컬 오프라인 전용)
