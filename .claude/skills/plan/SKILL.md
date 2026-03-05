---
name: plan
description: "dev-note 신규 기능 구현 전 Task/SubTask 계획 수립. '계획 세워줘', 'SubTask 나눠줘' 등 언급 시 호출"
argument-hint: "[기능명 또는 작업 설명]"
---

# dev-note Task / SubTask 계획 수립

$ARGUMENTS 에 대한 실행 계획을 수립한다.

---

## ✂️ SubTask 분리 포맷

```
[Task] 기능명
  ├── SubTask 1: Dexie 스키마/타입 정의  → src/core/db.ts
  ├── SubTask 2: 암호화 유틸 수정        → src/core/crypto.ts
  ├── SubTask 3: Jotai atom 추가         → src/store/atoms.ts
  ├── SubTask 4: feature 로직/훅 구현    → src/features/*/
  └── SubTask 5: 공통 UI 컴포넌트        → src/shared/components/
```

의존성 순서 원칙:
- `core/` → `store/` → `features/` → `shared/` 순으로 구현
- 각 SubTask 완료 후 `bash verify.sh` 검증 → 통과 시 다음 SubTask 진행

---

## 🎯 작업 유형별 접근 관점

| 작업 유형 | 접근 관점 |
|---|---|
| UI 컴포넌트 구현 | React 19 + Tailwind v4 기반, 기존 shared/components 재사용 우선 |
| Dexie 스키마 / 타입 정의 | 마이그레이션 영향도 먼저 분석, version() 번호 증가 필수 |
| 암호화 로직 구현 | safeEncrypt/safeDecrypt 패턴 준수, CryptoKey 메모리 외 저장 금지 |
| Jotai 상태 관리 | atoms.ts 단일 정의, 로컬 상태는 useState로 분리 |
| CodeMirror 에디터 | 탭 전환 시 hidden 처리(언마운트 금지), 언어 모드 동적 설정 |
| 파일 I/O 구현 | File System Access API + Blob URL 폴백 항상 병행 구현 |
| Fuse.js 검색 | 평문 필드(title, tags) 기반 인덱싱, 클라이언트 사이드 전용 |
| 버그 수정 | 최소 변경 원칙 — 수정 전 연계 모듈 영향도 먼저 파악 |
| 성능 최적화 | useLiveQuery 쿼리 범위 최소화, 불필요한 리렌더링 제거 |

---

## 출력 형식

```
[판단 결과] 단일 Task / SubTask N개 분리

[Task] 기능명
  ├── SubTask 1: ...  → 파일경로  (접근 관점: ...)
  └── SubTask N: ...  → 파일경로  (접근 관점: ...)

[구현 시 주의사항]
- 영향 받는 기존 파일:
- 사이드이펙트 위험:
- 선행 확인 필요 항목:
```
