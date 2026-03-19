#!/bin/bash
# ================================================================
# verify.sh — 코드 변경 자동 검증 파이프라인
# dev-note | Claude Code 워크플로우
#
# 사용법:
#   bash verify.sh              # 변경 파일 감지 + 전체 검증
#   bash verify.sh --ts-only    # TypeScript 검사만
#   bash verify.sh --ai         # Claude AI 분석 포함 (claude CLI 필요)
#   bash verify.sh --staged     # staged 파일만 검사
#   bash verify.sh --full       # 변경 감지 없이 전체 파일 검사
# ================================================================
set -euo pipefail

# ─── 옵션 파싱 ─────────────────────────────────────────────────
TS_ONLY=false
AI_MODE=false
STAGED_ONLY=false
FULL_SCAN=false

for arg in "$@"; do
  case $arg in
    --ts-only) TS_ONLY=true ;;
    --ai)      AI_MODE=true ;;
    --staged)  STAGED_ONLY=true ;;
    --full)    FULL_SCAN=true ;;
  esac
done

# ─── 컬러 출력 함수 ────────────────────────────────────────────
pass()   { echo -e "\033[0;32m  ✔ $*\033[0m"; }
fail()   { echo -e "\033[0;31m  ✘ $*\033[0m"; }
info()   { echo -e "\033[0;36m  ℹ $*\033[0m"; }
warn()   { echo -e "\033[0;33m  ⚠ $*\033[0m"; }
header() { echo -e "\n\033[1;34m▶ $*\033[0m"; }

FAIL_COUNT=0
SPEC_FAILS=0

# ─── 변경 파일 감지 ───────────────────────────────────────────
header "변경 파일 감지"
CHANGED_FILES=""

if [ "$FULL_SCAN" = true ]; then
  CHANGED_FILES=$(find src -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort || true)
  FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo 0)
  info "전체 스캔 모드 — ${FILE_COUNT}개 파일"
elif [ "$STAGED_ONLY" = true ]; then
  CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo 0)
  info "Staged 파일 — ${FILE_COUNT}개"
else
  UNSTAGED=$(git diff --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  STAGED_F=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
  CHANGED_FILES=$(printf '%s\n%s' "$UNSTAGED" "$STAGED_F" | sort -u | grep -v '^$' || true)
  FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo 0)
  info "변경된 TS/TSX 파일 — ${FILE_COUNT}개"
fi

# ─── Spec 검사 (CLAUDE.md 기반) ──────────────────────────────
header "📋 Spec 검사 (CLAUDE.md 규칙)"

if [ -n "$CHANGED_FILES" ]; then
  while IFS= read -r file; do
    [ -f "$file" ] || continue

    # ── [Spec 1] any 타입 금지 (TypeScript Strict Mode) ──────
    if grep -nE ': any([^a-zA-Z_]|$)' "$file" 2>/dev/null | grep -v '^\s*//' | grep -q .; then
      fail "[any 타입] ': any' 사용 금지 — unknown 또는 명시 타입으로 교체: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

    # ── [Spec 2] CryptoKey 영구 스토리지 저장 금지 ───────────
    if grep -niE '(localStorage|sessionStorage)\.' "$file" 2>/dev/null | grep -qi 'cryptoKey'; then
      fail "[보안] CryptoKey를 localStorage/sessionStorage에 저장 시도: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

    # ── [Spec 3] 마스터 패스워드 저장 금지 ───────────────────
    if grep -niE '(localStorage|sessionStorage)\.' "$file" 2>/dev/null | grep -qi 'password\|masterPass'; then
      fail "[보안] 마스터 패스워드를 영구 스토리지에 저장 시도: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

    # ── [Spec 4] Dexie 스키마 암호화 필드 인덱스 노출 금지 ───
    if grep -n '\.stores(' "$file" 2>/dev/null | grep -qE 'encryptedContent|\biv\b'; then
      fail "[Dexie] 암호화 필드(encryptedContent/iv)를 Dexie 인덱스에 노출: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

    # ── [Spec 5] 외부 fetch 호출 금지 (완전 로컬 오프라인 앱) ─
    # 예외: src/core/ai.ts — Claude API / Worker 프록시 호출 (선택적 기능)
    # 예외: worker/ — 서버사이드 Worker (fetch는 정상 동작)
    if [[ "$file" != "src/core/ai.ts" ]] && [[ "$file" != worker/* ]]; then
      if grep -nE "(^|\s)fetch\(" "$file" 2>/dev/null | grep -v '^\s*//' | grep -q .; then
        fail "[보안] 외부 fetch() 호출 발견 — 이 앱은 완전 로컬 오프라인 전용: $file"
        SPEC_FAILS=$((SPEC_FAILS + 1))
      fi
    fi

    # ── [Spec 6] File System Access API — 폴백 병행 필수 ─────
    if grep -qE 'showSaveFilePicker|showOpenFilePicker' "$file" 2>/dev/null; then
      if ! grep -qE "in window|type=['\"]file['\"]" "$file" 2>/dev/null; then
        fail "[File I/O] File System Access API 사용 시 <input type=file> 폴백 누락: $file"
        SPEC_FAILS=$((SPEC_FAILS + 1))
      fi
    fi

    # ── [Spec 7] Jotai atom() 선언 위치 — atoms.ts 외 금지 ──
    if [[ "$file" != "src/store/atoms.ts" ]]; then
      if grep -nE "= atom\(|= atom<" "$file" 2>/dev/null | grep -v '^\s*//' | grep -q .; then
        fail "[Jotai] 전역 atom 선언은 src/store/atoms.ts에서만 가능: $file"
        SPEC_FAILS=$((SPEC_FAILS + 1))
      fi
    fi

    # ── [Spec 8] TypeScript 5.7+ Uint8Array → Web Crypto 캐스팅 확인 ─
    if grep -q 'Uint8Array' "$file" 2>/dev/null && \
       grep -qE 'subtle\.(encrypt|decrypt|importKey|deriveKey)' "$file" 2>/dev/null; then
      if ! grep -q 'as unknown as ArrayBuffer' "$file" 2>/dev/null; then
        warn "[TypeScript 5.7+] Uint8Array → Web Crypto 전달 시 'as unknown as ArrayBuffer' 캐스팅 누락 의심: $file"
      fi
    fi

    # ── [Spec 9] Tailwind v3 방식 혼용 금지 ──────────────────
    if grep -nE "require\('tailwindcss'\)|tailwind\.config" "$file" 2>/dev/null | grep -v '^\s*//' | grep -q .; then
      fail "[Tailwind] v3 방식(tailwind.config) 감지 — @tailwindcss/vite 플러그인 방식(v4)만 허용: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

  done <<< "$CHANGED_FILES"

  if [ "$SPEC_FAILS" -eq 0 ]; then
    pass "모든 Spec 검사 통과"
  else
    fail "Spec 검사 ${SPEC_FAILS}건 실패"
    FAIL_COUNT=$((FAIL_COUNT + SPEC_FAILS))
  fi
else
  info "변경된 파일 없음 — Spec 검사 건너뜀"
fi

# ─── TypeScript 타입 체크 ─────────────────────────────────────
header "🔍 TypeScript 타입 체크"
TS_OUTPUT=$(npx tsc --noEmit 2>&1 || true)
TS_ERRORS=$(echo "$TS_OUTPUT" | (grep -c ' error TS' 2>/dev/null || echo 0))
if [ "${TS_ERRORS}" -gt 0 ]; then
  fail "TypeScript 오류 ${TS_ERRORS}건"
  echo "$TS_OUTPUT" | grep ' error TS' | head -20
  FAIL_COUNT=$((FAIL_COUNT + TS_ERRORS))
else
  pass "TypeScript 타입 체크 통과"
fi

# ─── ESLint (v9 flat config) ──────────────────────────────────
if [ "$TS_ONLY" = false ]; then
  header "🧹 ESLint 정적 분석"
  ESLINT_EXIT=0
  npm run lint -- --max-warnings 0 2>&1 || ESLINT_EXIT=$?
  if [ "$ESLINT_EXIT" -ne 0 ]; then
    fail "ESLint 경고 또는 오류 발견 (exit: $ESLINT_EXIT)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    pass "ESLint 통과"
  fi
fi

# ─── 빌드 검증 ────────────────────────────────────────────────
if [ "$TS_ONLY" = false ]; then
  header "🏗️  빌드 검증"
  BUILD_EXIT=0
  npm run build 2>&1 || BUILD_EXIT=$?
  if [ "$BUILD_EXIT" -ne 0 ]; then
    fail "빌드 실패 (exit: $BUILD_EXIT)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    pass "빌드 성공"
  fi
fi

# ─── Claude AI 분석 (`--ai` 플래그) ──────────────────────────
if [ "$AI_MODE" = true ]; then
  header "🤖 Claude AI 코드 분석"
  if ! command -v claude &>/dev/null; then
    warn "claude CLI 없음 — AI 분석 건너뜀 (설치: npm install -g @anthropic-ai/claude-code)"
  else
    DIFF_OUTPUT=$(git diff HEAD 2>/dev/null | head -300 || true)
    CLAUDE_PROMPT="다음은 dev-note 프로젝트 코드 변경사항입니다. 아래 규칙 기준으로 검토해줘.

## 프로젝트 핵심 규칙 (CLAUDE.md)
- TypeScript strict mode: any 타입 금지 (unknown 사용)
- CryptoKey는 Jotai atom(메모리)에만 — localStorage/IndexedDB 저장 절대 금지
- Dexie: encryptedContent, iv 필드는 스키마 인덱스 제외
- 완전 로컬 오프라인 앱: 외부 fetch/API 호출 금지
- File System Access API: 반드시 <input type=file> 폴백 병행
- Jotai atom 선언: src/store/atoms.ts 에서만
- Tailwind CSS v4(@tailwindcss/vite) 방식만 사용

## 변경사항 (git diff HEAD)
${DIFF_OUTPUT}

## 분석 요청
1. 규칙 위반 항목 (파일명·줄번호 포함)
2. 설계 이탈 또는 사이드이펙트 위험
3. 최종 판정: ✅ 안전 / ⚠️ 주의 필요 / ❌ 수정 필요"

    echo "$CLAUDE_PROMPT" | claude --print 2>/dev/null || warn "Claude AI 분석 실패"
  fi
fi

# ─── 최종 결과 ────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "${FAIL_COUNT}" -eq 0 ]; then
  echo -e "\033[0;32m  ✅ 모든 검증 통과\033[0m"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "\033[0;31m  ❌ 총 ${FAIL_COUNT}건 문제 발견 — 수정 후 재실행\033[0m"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
