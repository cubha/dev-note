---
name: verify
description: "Cursor가 구현한 코드를 검증할 때 사용. '검증해줘', '체크리스트 확인', '코드 리뷰' 등 언급 시 호출"
argument-hint: "[검증할 파일경로 또는 기능명]"
disable-model-invocation: false
---

# dev-note 코드 검증

$ARGUMENTS 에 대해 아래 체크리스트를 순서대로 확인하고 결과를 보고한다.

---

## ✅ 검증 체크리스트

### TypeScript
- [ ] `any` 타입 미사용 (`unknown` 또는 명시적 타입)
- [ ] TypeScript 5.7+ `Uint8Array<ArrayBufferLike>` → Web Crypto API 전달 시 `as unknown as ArrayBuffer` 캐스팅 여부
- [ ] Strict Mode 위반 없음 (null 체크 포함)

### Dexie v4
- [ ] `encryptedContent`, `iv` 등 암호화 필드는 스키마 인덱스에서 제외
- [ ] `useLiveQuery` 훅은 컴포넌트 최상단에서 호출
- [ ] DB 마이그레이션 필요 시 `version()` 버전 번호 증가 여부

### 암호화 (Web Crypto API)
- [ ] `CryptoKey`는 `cryptoKeyAtom` (메모리)에만 저장 — IndexedDB/localStorage 저장 절대 금지
- [ ] 평문 허용 필드: `title`, `tags`, `type` — 나머지는 반드시 `encryptedContent` 안에 포함
- [ ] `safeEncrypt` / `safeDecrypt` 사용 (암호화 비활성 상태 자동 처리)
- [ ] 새로고침 시 `CryptoKey` 소멸 → 마스터 패스워드 재입력 흐름 보장 여부

### File I/O
- [ ] File System Access API 미지원 브라우저 폴백(`<input type="file">`) 처리 여부
- [ ] 가져오기 시 JSON 스키마 유효성 검사 포함 여부
- [ ] `lastExportAt` 업데이트 여부

### CodeMirror 6
- [ ] 언어 모드는 항목 `type`에 따라 동적으로 설정 (`json` / `sql` / `text`)
- [ ] 탭 전환 시 에디터 인스턴스 언마운트되지 않고 hidden 처리 (성능)

### Jotai
- [ ] 전역 상태는 반드시 `src/store/atoms.ts`에 정의
- [ ] 로컬 UI 상태는 `useState` 사용 (atom 남용 금지)
- [ ] `dirtyItemsAtom` — 편집 시 추가, Ctrl+S 저장 완료 시 제거 여부

### React Hooks
- [ ] `useEffect` 내 `setState` 동기 호출 없음 (`react-hooks/set-state-in-effect` 위반)
- [ ] `tabStates` (Map) atom이 deps에 포함되어 무한 루프 발생하지 않는지
- [ ] `exhaustive-deps` 경고 없음

### 사이드 이펙트
- [ ] `shared/components/` 수정 시 전체 feature 영향도 확인
- [ ] Dexie 스키마 변경 시 기존 데이터 마이그레이션 처리 여부
- [ ] 외부 fetch() 호출 없음 (완전 로컬 오프라인 앱)

---

## 보고 형식

```
## 검증 결과: [기능명]

### ✅ 통과
- ...

### ⚠️ 경고
- ...

### ❌ 문제
- ...

### 종합 판정: ✅ 통과 / ⚠️ 수정 권장 / ❌ 수정 필요
```
