현재 프로젝트의 `package.json`과 `CLAUDE.md`를 모두 읽어서 프로젝트에 최적화된 `verify.sh`를 생성한다.

## 분석 순서

1. `package.json` 읽기 (dependencies, devDependencies, scripts, packageManager 확인)
2. `CLAUDE.md` 읽기 (존재하면) — 프로젝트 전용 규칙, 금지사항, 보안 규칙, 알려진 이슈 추출
3. lock 파일로 패키지 매니저 감지:
   - `bun.lockb` → `bun`
   - `pnpm-lock.yaml` → `pnpm`
   - `yarn.lock` → `yarn`
   - 그 외 → `npm`
4. 아래 기준으로 기술 스택 감지:
   - `next` 포함 → Next.js 프로젝트
   - `vite` 포함 (next 없음) → Vite 프로젝트
   - `typescript` 포함 → TypeScript 체크 추가
   - `eslint` 포함 → ESLint 단계 추가
   - `vitest` 포함 → vitest 테스트 단계 추가
   - `jest` 포함 → jest 테스트 단계 추가
   - `dexie` 포함 → Dexie 전용 Spec 검사 추가
   - `@supabase` 포함 → Supabase 전용 Spec 검사 추가
5. `verify.sh` 생성

---

## verify.sh 구조 (반드시 이 순서로 생성)

### 헤더
```bash
#!/bin/bash
# ================================================================
# verify.sh — Cursor 변경 자동 검증 파이프라인
# {프로젝트명} | Claude Code + Cursor 협업 워크플로우
#
# 사용법:
#   ./verify.sh              # 변경 파일 감지 + 전체 검증
#   ./verify.sh --ts-only    # TypeScript 검사만
#   ./verify.sh --ai         # Claude AI 분석 포함 (claude CLI 필요)
#   ./verify.sh --staged     # staged 파일만 검사
#   ./verify.sh --full       # 변경 감지 없이 전체 파일 검사
# ================================================================
set -euo pipefail
```

### 옵션 파싱
`--ts-only`, `--ai`, `--staged`, `--full` 4개 플래그 파싱

### 컬러 출력 함수
`pass()` `fail()` `info()` `warn()` `header()` 함수 정의 (ANSI 컬러 코드 사용)

### 변경 파일 감지 섹션
- `--full` 플래그면 변경 감지 없이 전체 파일 대상
- `--staged` 플래그면 `git diff --cached`
- 기본: `git diff --name-only` + `git diff --cached --name-only` 합산
- 변경 파일 없으면 조기 종료

---

## Spec 패턴 검사 섹션 (CLAUDE.md 기반)

CLAUDE.md에서 아래 항목을 추출해서 검사 로직으로 변환한다.

### 항상 포함 (TypeScript 프로젝트 공통)
- `any` 타입 금지: `: any` 패턴을 `.ts/.tsx` 파일에서 grep

### CLAUDE.md의 "금지 사항" / "보안 규칙" / "알려진 이슈" 섹션에서 추출
각 규칙을 grep 패턴으로 변환해서 포함한다. 예시:

**Dexie 프로젝트 감지 시 (또는 CLAUDE.md에 Dexie 규칙 있을 때):**
```bash
# Dexie 암호화 필드 인덱스 노출 금지
if grep -n "stores(" "$file" | grep -qE 'encryptedContent|[^a-z]iv[^a-z]'; then
  fail "Dexie 스키마에 암호화 필드 인덱스 노출: $file"; ((SPEC_FAILS++)) || true
fi
```

**Web Crypto API / 보안 규칙 있을 때:**
```bash
# CryptoKey 영구 스토리지 저장 금지
if grep -n 'localStorage\|sessionStorage' "$file" | grep -qi 'cryptokey'; then
  fail "CryptoKey를 localStorage/sessionStorage에 저장 시도: $file"; ((SPEC_FAILS++)) || true
fi
```

**완전 로컬 앱 (외부 API 금지) 규칙 있을 때:**
```bash
# 외부 fetch 호출 금지
if grep -n 'fetch(' "$file" | grep -v '// ' | grep -q .; then
  fail "외부 fetch() 호출 발견 (완전 로컬 앱): $file"; ((SPEC_FAILS++)) || true
fi
```

**File System Access API 규칙 있을 때:**
```bash
# 폴백 패턴 없는 단독 사용 감지
if grep -q 'showSaveFilePicker\|showOpenFilePicker' "$file"; then
  if ! grep -qE "'showSaveFilePicker' in window|type=['\"]file['\"]" "$file"; then
    fail "File System Access API 폴백 없음: $file"; ((SPEC_FAILS++)) || true
  fi
fi
```

**Next.js + Supabase 프로젝트 감지 시:**
```bash
# NEXT_PUBLIC_ 환경변수에 서버 시크릿 노출 금지
if grep -n 'NEXT_PUBLIC_' "$file" | grep -qiE 'secret|token|key|password'; then
  fail "NEXT_PUBLIC_ 에 시크릿 노출 위험: $file"; ((SPEC_FAILS++)) || true
fi
# await 없는 cookies()/params/searchParams 사용 감지
if grep -n 'cookies()\|searchParams\.' "$file" | grep -v 'await' | grep -q .; then
  warn "await 없는 cookies()/searchParams 사용 의심: $file"
fi
```

CLAUDE.md에 명시된 다른 규칙들도 동일하게 grep 패턴으로 변환해서 추가한다.

---

## TypeScript 컴파일 검사 섹션

```bash
TS_OUTPUT=$(npx tsc --noEmit 2>&1 || true)
# 오류 있으면 fail + 오류 수 카운트, 없으면 pass
```

---

## ESLint 섹션 (eslint 감지 시)

- 변경된 .ts/.tsx 파일만 대상
- `npx eslint {파일들} --max-warnings=0`
- 오류/경고 있으면 fail + 카운트

---

## 테스트 섹션 (vitest/jest 감지 시)

- vitest: `{pkgManager} run test --run`
- jest: `{pkgManager} run test --watchAll=false`
- `--ts-only` 플래그면 생략

---

## 빌드 검증 섹션

- `{pkgManager} run build`
- `--ts-only` 플래그면 생략

---

## Claude AI 분석 섹션 (`--ai` 플래그 시)

```bash
if [ "$AI_MODE" = true ]; then
  # git diff HEAD 와 CLAUDE.md 내용을 합쳐서 claude --print 로 전달
  # 프롬프트: 규칙 위반, 설계 이탈, 사이드이펙트 위험, 최종 판정(✅/⚠️/❌) 요청
fi
```

---

## 최종 결과 섹션

```bash
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "\n  ✅ 모든 검사 통과\n"
  exit 0
else
  echo -e "\n  ❌ ${FAIL_COUNT}개 문제 발견\n"
  exit 1
fi
```

---

## 생성 완료 후

1. 생성된 `verify.sh`의 전체 내용을 출력해서 사용자가 확인할 수 있게 한다
2. CLAUDE.md에서 추출한 프로젝트 전용 Spec 검사 항목 목록을 별도로 요약한다
3. Windows 환경 안내: Git Bash / WSL 에서 `bash verify.sh` 실행
