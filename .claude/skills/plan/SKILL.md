---
name: plan
description: "dev-note 신규 기능 구현 전 Task/SubTask 계획 수립. '계획 세워줘', 'SubTask 나눠줘' 등 언급 시 호출"
argument-hint: "[기능명 또는 작업 설명]"
---

# dev-note Task / SubTask 계획 수립

$ARGUMENTS 에 대한 실행 계획을 수립한다.

> 공통 판단 기준은 글로벌 `/plan` skill과 동일. 이 파일은 프로젝트별 포맷과 페르소나를 추가 정의한다.

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

---

## 🎭 페르소나 정의표

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

## 출력 형식

```
[판단 결과] 단일 Task / SubTask N개 분리

[Task] 기능명
  ├── SubTask 1: ...  → 파일경로
  └── SubTask N: ...  → 파일경로

[Cursor 프롬프트 작성 시 사용할 페르소나]
SubTask 1: [페르소나명]
SubTask 2: [페르소나명]
```
