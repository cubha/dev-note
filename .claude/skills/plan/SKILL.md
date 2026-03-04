---
name: plan
description: "dev-note 신규 기능 구현 전 Task/SubTask 계획 수립. '계획 세워줘', 'SubTask 나눠줘' 등 언급 시 호출"
argument-hint: "[기능명 또는 작업 설명]"
---

# dev-note Task / SubTask 계획 수립

$ARGUMENTS 에 대한 실행 계획을 수립한다.

---

## ✂️ SubTask 분리 기준

- 파일/모듈 단위로 분리 (여러 레이어를 한 SubTask에 묶지 않는다)
- 의존성 순서 준수: `core` → `store` → `features` → `shared`
- 각 SubTask는 독립적으로 구현 및 검증 가능해야 함

```
[Task] 기능명
  ├── SubTask 1: Dexie 스키마/타입 정의  → src/core/db.ts
  ├── SubTask 2: 암호화 유틸 수정        → src/core/crypto.ts
  ├── SubTask 3: Jotai atom 추가         → src/store/atoms.ts
  ├── SubTask 4: feature 로직/훅 구현    → src/features/*/
  └── SubTask 5: 공통 UI 컴포넌트        → src/shared/components/
```

---

## 🎯 작업 유형별 접근법

| 작업 유형 | 핵심 고려사항 |
|---|---|
| UI 컴포넌트 구현 | Tailwind v4 방식, 공통 컴포넌트 재사용 우선 |
| Dexie 스키마 / 타입 정의 | version() 번호 증가, 암호화 필드 스키마 제외 |
| 암호화 로직 구현 | safeEncrypt/safeDecrypt 사용, CryptoKey 메모리에만 |
| Jotai 상태 관리 | atoms.ts에만 정의, 로컬 상태는 useState |
| CodeMirror 에디터 | 언어 모드 동적 설정, 탭 hidden 처리 |
| 파일 I/O 구현 | File System Access API + 폴백 병행, 스키마 검증 |
| Fuse.js 검색 | 클라이언트 사이드, 외부 API 호출 없음 |
| 버그 수정 | 최소 변경 원칙, 연계 모듈 사이드이펙트 확인 |
| 성능 최적화 | React 렌더링 분석, useLiveQuery 의존성 확인 |

---

## 출력 형식

```
[판단 결과] 단일 Task / SubTask N개 분리

[Task] 기능명
  ├── SubTask 1: ...  → 파일경로
  └── SubTask N: ...  → 파일경로

[구현 시 주의사항]
- 주요 사이드이펙트 또는 특이사항
```
