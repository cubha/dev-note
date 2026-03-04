---
name: verify
description: "verify.sh 통과 후 아키텍처 수준 AI 리뷰가 필요할 때 사용. '/verify' 또는 '코드 리뷰해줘' 요청 시 호출"
argument-hint: "[검증할 파일경로 또는 기능명]"
disable-model-invocation: false
---

# dev-note 코드 리뷰 (AI 보조)

> **기본 검증**: `bash verify.sh` (tsc + eslint + spec 패턴 9개 + build)
> 이 skill은 verify.sh가 잡지 못하는 **아키텍처 수준 문제**를 검토할 때 사용한다.

$ARGUMENTS 에 대해 아래 항목을 확인하고 결과를 보고한다.

---

## 검토 항목 (verify.sh 커버 범위 밖)

### 모듈 의존성
- [ ] core → features 역참조 등 의존성 방향 위반 여부
- [ ] shared/components 수정 시 전체 feature 영향도 확인

### React Hooks
- [ ] `useEffect` 내 `setState` 동기 호출 없음
- [ ] `tabStates` (Map) atom이 deps에 포함되어 무한 루프 위험 없음
- [ ] `useLiveQuery` 훅이 컴포넌트 최상단에서 호출됨
- [ ] `exhaustive-deps` 경고 없음

### Dexie 마이그레이션
- [ ] 스키마 변경 시 `version()` 번호 증가 여부
- [ ] 기존 데이터 마이그레이션 처리 여부

### 암호화 흐름
- [ ] 새로고침 시 `CryptoKey` 소멸 → 마스터 패스워드 재입력 흐름 보장

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
