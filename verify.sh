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
#   bash verify.sh --full       # 변경 감지 없이 전체 파일 검사 (E2E 포함)
#   bash verify.sh --e2e        # E2E를 명시적으로 포함
#   bash verify.sh --no-e2e     # --full 이어도 E2E 제외
#
# E2E 정책: 개발 루프(무플래그·--ts-only·--no-build)에서는 돌리지 않는다(느림).
#   --full(= /ship 게이트)에서만 자동 실행 → 머지 전에 반드시 한 번은 통과한다.
# ================================================================
set -euo pipefail

# ─── 옵션 파싱 ─────────────────────────────────────────────────
TS_ONLY=false
NO_BUILD=false
AI_MODE=false
STAGED_ONLY=false
FULL_SCAN=false
E2E_MODE=false
E2E_OPT_OUT=false

for arg in "$@"; do
  case $arg in
    --ts-only)  TS_ONLY=true ;;
    --no-build) NO_BUILD=true ;;
    --ai)       AI_MODE=true ;;
    --staged)   STAGED_ONLY=true ;;
    --full)     FULL_SCAN=true ;;
    --e2e)      E2E_MODE=true ;;
    --no-e2e)   E2E_OPT_OUT=true ;;
  esac
done

# --full 은 머지 직전 풀 게이트다 → E2E를 기본 포함한다.
[ "$FULL_SCAN" = true ] && E2E_MODE=true
[ "$E2E_OPT_OUT" = true ] && E2E_MODE=false
# 타입만 보거나 빌드를 건너뛰는 빠른 경로에서는 E2E를 돌리지 않는다.
{ [ "$TS_ONLY" = true ] || [ "$NO_BUILD" = true ]; } && E2E_MODE=false

# ─── 컬러 출력 함수 ────────────────────────────────────────────
pass()   { echo -e "\033[0;32m  ✔ $*\033[0m"; }
fail()   { echo -e "\033[0;31m  ✘ $*\033[0m"; }
info()   { echo -e "\033[0;36m  ℹ $*\033[0m"; }
warn()   { echo -e "\033[0;33m  ⚠ $*\033[0m"; }
header() { echo -e "\n\033[1;34m▶ $*\033[0m"; }

# ─── 행(hang) 가드 러너 (F-NEW-33) ────────────────────────────
# 장시간 명령은 $() 캡처 금지 + timeout 필수. 근거(실측): 명령이 정상 종료해도 고아 자식이
# stdout을 물면 셸이 계속 블록되고(6002ms·exit=0) timeout은 발동조차 하지 않는다 → 124도 로그도 없음.
# vite+vitest 워커가 정확히 그 지형이라 이 프로젝트는 1순위 대상이다.
# `--foreground` 금지 — 그룹 킬이 꺼져 고아가 무한 대기한다(≥58s 관측).
VERIFY_LOG_DIR="${TMPDIR:-/tmp}/verify-dev-note-$$"
mkdir -p "$VERIFY_LOG_DIR"
VERIFY_TIMEOUT_TSC=${VERIFY_TIMEOUT_TSC:-120}    # 실측 `tsc -b` 14s @9p
VERIFY_TIMEOUT_LINT=${VERIFY_TIMEOUT_LINT:-120}
VERIFY_TIMEOUT_TEST=${VERIFY_TIMEOUT_TEST:-240}
VERIFY_TIMEOUT_BUILD=${VERIFY_TIMEOUT_BUILD:-600}
# E2E = webServer 기동(WSL2 /mnt/d 최악 ~120s) + 스펙 실행. 넉넉히 잡되 무한 대기는 막는다.
VERIFY_TIMEOUT_E2E=${VERIFY_TIMEOUT_E2E:-480}
# 불변식: fast gate(--no-build) 최악 480s < TeammateIdle hook timeout 600s

run_guarded() {
  local secs="$1" logname="$2"; shift 2
  local log="$VERIFY_LOG_DIR/$logname" rc=0 wd=""
  # 동결 시점 스냅샷 — timeout 그룹 킬이 증거를 지우기 전에 촬영. 서브셸 출력은 반드시 닫는다
  # (상위가 verify.sh를 $()로 캡처할 때 워치독이 파이프를 물면 우리가 그 행을 만든다).
  ( sleep $(( secs * 2 / 3 )); ps -ef --forest > "$VERIFY_LOG_DIR/freeze-$logname" 2>/dev/null ) >/dev/null 2>&1 &
  wd=$!
  timeout --kill-after=15 "$secs" "$@" > "$log" 2>&1 || rc=$?
  kill "$wd" 2>/dev/null || true; wait "$wd" 2>/dev/null || true
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    fail "행(hang) 감지: '$*' 이 ${secs}초 내 미종료 (exit $rc)"
    {
      echo "=== 명령: $* (상한 ${secs}s, exit $rc)"
      echo "=== 동결 시점 프로세스 트리 ==="
      cat "$VERIFY_LOG_DIR/freeze-$logname" 2>/dev/null || echo "(스냅샷 없음)"
      echo "=== 그룹 킬 생존자 (esbuild service·vite optimizer·vitest worker) ==="
      ps -ef --forest 2>/dev/null | grep -E 'esbuild|vite|vitest|tsserver' | grep -v grep || echo "(없음)"
      echo "=== 로그 마지막 50줄 ==="
      tail -50 "$log" 2>/dev/null
    } > "$VERIFY_LOG_DIR/forensic-$logname" 2>&1
    warn "포렌식 덤프: $VERIFY_LOG_DIR/forensic-$logname"
  fi
  return "$rc"
}

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

# ── 디자인 토큰 선언 목록 수집 (루프 '전' 1회만) ────────────────
# 이 repo의 토큰은 src/index.css의 `@layer base` 안에 들어 있어 :root가 2-space 들여쓰기돼 있다.
# `^:root` 로 범위를 자르면 결과가 빈다 — 그래서 블록 범위가 아니라 '선언 줄' 자체를 본다.
# (`:root` · `:root[data-theme="light"]` · @media 내부 `:root` 세 블록이 모두 자동 포함된다.)
# 형식은 hex/rgba 리터럴이며 채널삼중값(shadcn식 `50 13% 96%`)이 0개 → hsl() 래핑 규칙은 해당 없음.
TOKEN_CSS="src/index.css"
DECLARED_TOKENS=""
if [ -f "$TOKEN_CSS" ]; then
  DECLARED_TOKENS=$(grep -oE '^[[:space:]]*--[a-zA-Z0-9_-]+[[:space:]]*:' "$TOKEN_CSS" 2>/dev/null \
    | sed -E 's/[[:space:]]+//g; s/:$//' | sort -u || true)
  TOKEN_COUNT=$(printf '%s\n' "$DECLARED_TOKENS" | grep -c . || true)
  info "디자인 토큰 선언 ${TOKEN_COUNT:-0}개 수집 — $TOKEN_CSS"
fi

if [ -n "$CHANGED_FILES" ]; then
  while IFS= read -r file; do
    [ -f "$file" ] || continue

    # ── [Spec 1] any 타입 금지 (TypeScript Strict Mode) ──────
    if grep -nE ': any([^a-zA-Z_]|$)' "$file" 2>/dev/null | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
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

    # ── [Spec 3b] API 키 영구 스토리지 저장 금지 ─────────────
    # Spec 2/3이 cryptoKey·password만 봐서 BYOK API 키가 IndexedDB에 평문으로 들어가던 경로를
    # 통과시켰다(v18에서 제거). at-rest 암호화는 config 테이블을 덮지 않으므로 암호화를 켜도
    # 노출된다 — localStorage/sessionStorage뿐 아니라 Dexie 쓰기(db.<table>.put/add/update)도 막는다.
    if grep -niE '(localStorage|sessionStorage)\.(set|get)Item' "$file" 2>/dev/null | grep -qiE 'apikey|api_key'; then
      fail "[보안] API 키를 localStorage/sessionStorage에 저장 시도: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi
    if grep -niE 'db\.[a-zA-Z]+\.(put|add|update|bulkPut|bulkAdd)\(' "$file" 2>/dev/null | grep -qiE 'apikey|api_key'; then
      fail "[보안] API 키를 IndexedDB(Dexie)에 저장 시도 — 세션 메모리(atom) 전용: $file"
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
    # 예외: api/ — Vercel Edge Function 서버사이드 (fetch는 정상 동작)
    # 예외: src/features/sync/providers/ — Phase 2 옵트인 BYO-storage 동기화 프로바이더만
    #       (네트워크 접점은 이 디렉토리에 한정. syncEngine/keyManager는 인터페이스만 호출)
    # 예외: src/features/admin/ — admin 메트릭 대시보드(옵트인, /v1/metrics 조회). 네트워크 접점 한정
    if [[ "$file" != "src/core/ai.ts" ]] && [[ "$file" != worker/* ]] && [[ "$file" != api/* ]] \
       && [[ "$file" != src/features/sync/providers/* ]] && [[ "$file" != src/features/admin/* ]]; then
      if grep -nE "(^|\s)fetch\(" "$file" 2>/dev/null | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
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
      if grep -nE "= atom\(|= atom<" "$file" 2>/dev/null | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
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
    if grep -nE "require\('tailwindcss'\)|tailwind\.config" "$file" 2>/dev/null | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
      fail "[Tailwind] v3 방식(tailwind.config) 감지 — @tailwindcss/vite 플러그인 방식(v4)만 허용: $file"
      SPEC_FAILS=$((SPEC_FAILS + 1))
    fi

    # ── [Spec 10] 미정의 디자인 토큰 참조 금지 (무성 실패 클래스) ─
    # `var(--x)`의 --x가 index.css에 없으면 CSS 명세상 브라우저가 그 선언을 '조용히' 폐기한다.
    # tsc·eslint·빌드가 전부 통과하면서 스타일만 사라진다 → 기계 검사 외에 잡을 방법이 없다.
    # 매칭은 같은 줄에서 `)`로 닫히는 참조만 본다. 이 한 가지로 오탐 2종이 구조적으로 제거된다:
    #   ① 폴백 있는 참조 `var(--x, ...)` — 쉼표 때문에 미매칭(폴백이 있으면 실제로 동작한다)
    #   ② 동적 조립 `var(--badge-${meta.colorKey}-bg)` — `$`가 이름 문자열이 아니라 미매칭
    # ②의 실제 정합성(colorKey→선언 존재)은 정적 규칙의 사각지대이며 TYPE_META 리뷰로 담보한다.
    if [ -n "$DECLARED_TOKENS" ]; then
      while IFS= read -r tok; do
        [ -n "$tok" ] || continue
        if ! printf '%s\n' "$DECLARED_TOKENS" | grep -qx -- "$tok"; then
          fail "[디자인 토큰] 미선언 토큰 참조 var($tok) — 브라우저가 선언을 조용히 폐기: $file"
          SPEC_FAILS=$((SPEC_FAILS + 1))
        fi
      done <<< "$(grep -ohE 'var\([[:space:]]*--[a-zA-Z0-9_-]+[[:space:]]*\)' "$file" 2>/dev/null \
                    | sed -E 's/^var\([[:space:]]*//; s/[[:space:]]*\)$//' | sort -u || true)"
    fi

    # ── [Spec 11/12] 디자인 토큰 Ground Truth 대비 하드코딩 드리프트 (warn) ─
    # 산문 규칙만으로는 드리프트가 반드시 쌓인다(타 repo 실측 88·185곳) → 기계가 본다.
    # severity가 warn인 이유: 이 repo엔 치수 토큰이 3개뿐(--card-min-width/--card-gap/--sidebar-width)이라
    # arbitrary 값 대부분은 '옮겨담을 토큰 타깃 자체가 없다'. fail로 올리면 오탐이 파이프라인을 세운다.
    # 조건은 '토큰 실체'($DECLARED_TOKENS ← src/index.css)로 건다. GT 문서(docs/design/DESIGN-TOKENS.md)로
    # 걸면 이 repo는 .gitignore 가 docs/ 를 통째로 제외하므로 fresh clone·CI 에서 두 규칙이 조용히 꺼진다.
    if [ -n "$DECLARED_TOKENS" ]; then
      case "$file" in
        *index.css|*globals.css|*tokens.css|*theme.css|*variables.css) ;;
        *tokens.ts|*theme.ts|*tokens.js|*theme.js|*/design-tokens/*|*/design-system/*) ;;
        *)
          # [Spec 11] 하드코딩 hex — 정당한 예외는 같은 줄 `design-lint-ignore` 주석으로 면제
          if grep -nE '#[0-9a-fA-F]{3,8}\b' "$file" 2>/dev/null \
              | grep -v 'design-lint-ignore' | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
            warn "[디자인 토큰] 하드코딩 색 — var(--*)로 교체 (정당하면 design-lint-ignore 주석): $file"
          fi
          # [Spec 12] Tailwind arbitrary 값이 @theme/토큰을 우회
          if grep -nE '\[(#[0-9a-fA-F]{3,8}|[0-9]+(px|rem))\]' "$file" 2>/dev/null \
              | grep -v 'design-lint-ignore' | grep -v '^[0-9]*:[[:space:]]*//' | grep -q .; then
            warn "[디자인 토큰] Tailwind arbitrary 값이 토큰을 우회: $file"
          fi
          ;;
      esac
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

# ─── [Spec 13] 릴리즈 메타 정합성 (A3 재발 방지) ──────────────
# README·package.json 은 release-notes.ts / db.ts 의 **수동 사본**이라 릴리즈마다 갈라진다.
# 실측: README 릴리즈노트가 v1.6.1에서 정지해 10개 버전(약 3개월) 뒤처졌고, DB 스키마 헤딩은
# v14 표기인데 실제는 v21이었다. 산문 규칙으로는 못 막으므로 기계가 본다.
# 변경 파일 목록과 무관하게 항상 검사한다 — 드리프트는 "안 고친 것"이라 diff에 안 잡힌다.
if [ "$TS_ONLY" = false ] && [ -f README.md ] && [ -f src/features/onboarding/release-notes.ts ]; then
  header "📦 릴리즈 메타 정합성"
  META_FAILS=0

  # (1) release-notes.ts 최신 버전이 README에 등재됐는가
  LATEST_VER=$(grep -oE "version: '[^']+'" src/features/onboarding/release-notes.ts | head -1 | sed "s/version: '//; s/'//")
  if [ -n "$LATEST_VER" ]; then
    if grep -qF "### $LATEST_VER " README.md 2>/dev/null; then
      pass "README 릴리즈노트 최신 ($LATEST_VER)"
    else
      fail "README 릴리즈노트가 뒤처짐 — release-notes.ts 최신은 $LATEST_VER 인데 README에 없음"
      META_FAILS=$((META_FAILS + 1))
    fi
  fi

  # (2) package.json version 이 최신 릴리즈와 같은가 (코드가 참조하진 않지만 표기 신뢰도)
  PKG_VER=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[^"]+"' package.json | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
  if [ -n "$LATEST_VER" ] && [ -n "$PKG_VER" ] && [ "v$PKG_VER" != "$LATEST_VER" ]; then
    fail "package.json version($PKG_VER)이 최신 릴리즈($LATEST_VER)와 불일치"
    META_FAILS=$((META_FAILS + 1))
  fi

  # (3) README의 DB 스키마 표기가 db.ts 실제 최대 version(N)과 같은가
  if [ -f src/core/db.ts ]; then
    DB_VER=$(grep -oE 'this\.version\([0-9]+\)' src/core/db.ts | grep -oE '[0-9]+' | sort -n | tail -1)
    if [ -n "$DB_VER" ]; then
      # ⚠ **현재 상태를 주장하는 곳만** 본다. 과거 릴리즈노트 본문의 "DB v14 마이그레이션" 같은
      # 기술은 그 시점의 사실이라 고치면 오히려 이력이 틀어진다(첫 구현에서 실제로 오탐 2건 발생).
      README_DB_VERS=$(grep -oE '^## .*데이터 스키마 \(DB v[0-9]+\)|db\.ts[^#]*# .*스키마 v[0-9]+' README.md \
        | grep -oE 'v[0-9]+\)?$|스키마 v[0-9]+' | grep -oE '[0-9]+' | sort -u)
      for v in $README_DB_VERS; do
        if [ "$v" != "$DB_VER" ]; then
          fail "README DB 스키마 표기 v$v 가 실제 db.ts v$DB_VER 와 불일치"
          META_FAILS=$((META_FAILS + 1))
        fi
      done
      [ "$META_FAILS" -eq 0 ] && pass "DB 스키마 표기 일치 (v$DB_VER)"
    fi
  fi

  FAIL_COUNT=$((FAIL_COUNT + META_FAILS))
fi

# ─── 디자인 게이트 (design-lint) ──────────────────────────────
# 결정론·0토큰. 대상/스크립트/토큰 중 하나라도 없으면 스킵(FP 방지) — design-lint 자신의 skip 계약과 동일.
# ⚠️ 이 repo는 `FAIL_COUNT += SPEC_FAILS`를 Spec 루프의 `if [ -n "$CHANGED_FILES" ]` 블록 '안'에서만
#    수행한다. 그래서 루프 뒤에 놓이는 이 블록은 SPEC_FAILS를 올려도 아무도 읽지 않아 ✘를 찍고도
#    exit 0으로 샌다. 반드시 FAIL_COUNT를 직접 올린다.
DESIGN_LINT="$HOME/.claude/skills/design-lint/scripts/design-lint.mjs"
DESIGN_TARGETS=$(ls docs/design/prototype/*.html 2>/dev/null || true)

if [ -n "$DESIGN_TARGETS" ] && [ -f "$DESIGN_LINT" ] && command -v node >/dev/null 2>&1; then
  header "🔎 디자인 게이트 (design-lint)"
  DL_ARGS=""
  [ -f docs/design/DESIGN-TOKENS.md ] && DL_ARGS="--tokens docs/design/DESIGN-TOKENS.md"
  DL_EXIT=0
  # shellcheck disable=SC2086
  run_guarded 60 design-lint.log node "$DESIGN_LINT" $DESIGN_TARGETS $DL_ARGS --gate || DL_EXIT=$?
  if [ "$DL_EXIT" -eq 0 ]; then
    pass "design-lint 통과"
  else
    fail "design-lint error 발견 — $VERIFY_LOG_DIR/design-lint.log 확인"
    tail -30 "$VERIFY_LOG_DIR/design-lint.log" 2>/dev/null || true
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
  [ -f docs/design/DESIGN-TOKENS.md ] || warn "DESIGN-TOKENS.md 없음 — 토큰 위생 검사 스킵(/init-design 권장)"
else
  [ -n "$DESIGN_TARGETS" ] && warn "design-lint 스킵 — node 또는 스킬 스크립트 없음" || true
fi

# ─── TypeScript 타입 체크 ─────────────────────────────────────
header "🔍 TypeScript 타입 체크"
# tsconfig.json이 files:[] + references(Vite 구조)라 `tsc --noEmit`은 0파일 검사(vacuous) — `-b` 필수
# $() 캡처 폐지(F-NEW-33): tsc가 정상 종료해도 고아 자식이 파이프를 물면 셸이 계속 블록된다
TS_EXIT=0
run_guarded "$VERIFY_TIMEOUT_TSC" tsc.log npx tsc -b --noEmit || TS_EXIT=$?
TS_ERRORS=$(grep -c ' error TS' "$VERIFY_LOG_DIR/tsc.log" || true)
TS_ERRORS=${TS_ERRORS:-0}
if [ "$TS_EXIT" -eq 124 ] || [ "$TS_EXIT" -eq 137 ]; then
  FAIL_COUNT=$((FAIL_COUNT + 1))   # 행 자체가 실패 — 상세는 run_guarded가 보고
elif [ "${TS_ERRORS}" -gt 0 ]; then
  fail "TypeScript 오류 ${TS_ERRORS}건"
  grep ' error TS' "$VERIFY_LOG_DIR/tsc.log" | head -20
  FAIL_COUNT=$((FAIL_COUNT + TS_ERRORS))
else
  pass "TypeScript 타입 체크 통과"
fi

# ─── ESLint (v9 flat config) ──────────────────────────────────
if [ "$TS_ONLY" = false ]; then
  header "🧹 ESLint 정적 분석"
  ESLINT_EXIT=0
  run_guarded "$VERIFY_TIMEOUT_LINT" eslint.log npm run lint -- --max-warnings 0 || ESLINT_EXIT=$?
  if [ "$ESLINT_EXIT" -ne 0 ]; then
    tail -30 "$VERIFY_LOG_DIR/eslint.log"
    fail "ESLint 경고 또는 오류 발견 (exit: $ESLINT_EXIT)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    pass "ESLint 통과"
  fi
fi

# ─── 단위 테스트 ──────────────────────────────────────────────
if [ "$TS_ONLY" = false ]; then
  header "단위 테스트"
  UNIT_TEST_FILES=$(find . -type d -name node_modules -prune -o \
      -type f \( -name '*.test.ts' -o -name '*.test.tsx' \
                 -o -name '*.test.js' -o -name '*.test.jsx' \
                 -o -name '*.spec.ts' -o -name '*.spec.tsx' \) -print 2>/dev/null \
    | grep -vE '(^|/)(e2e|tests/e2e)/|\.e2e\.' | head -1 || true)
  UNIT_RUNNER=""
  grep -qE '"vitest"' package.json 2>/dev/null && UNIT_RUNNER="vitest" || true
  grep -qE '"jest"'   package.json 2>/dev/null && UNIT_RUNNER="jest"   || true
  if [ -z "$UNIT_TEST_FILES" ]; then
    info "단위 테스트 없음 — 건너뜀 (E2E는 별도 레이어에서 검증)"
  elif [ -z "$UNIT_RUNNER" ]; then
    fail "단위 테스트 파일이 존재하나 러너(vitest/jest) 미설치 — verify에서 실행 불가"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif ! grep -qE '"test"[[:space:]]*:' package.json 2>/dev/null; then
    fail "단위 테스트 파일이 존재하나 package.json에 \"test\" 스크립트 없음"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    TEST_EXIT=0
    run_guarded "$VERIFY_TIMEOUT_TEST" unittest.log npm run test || TEST_EXIT=$?
    if [ "$TEST_EXIT" -ne 0 ]; then
      fail "단위 테스트 실패 ($UNIT_RUNNER)"; tail -30 "$VERIFY_LOG_DIR/unittest.log"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      pass "단위 테스트 통과 ($UNIT_RUNNER)"
    fi
  fi
fi

# ─── 빌드 검증 ────────────────────────────────────────────────
if [ "$TS_ONLY" = false ] && [ "$NO_BUILD" = true ]; then
  info "빌드 건너뜀 (--no-build) — 풀 빌드는 COMPLETE/ship 게이트에서 실행"
fi
if [ "$TS_ONLY" = false ] && [ "$NO_BUILD" = false ]; then
  header "🏗️  빌드 검증"
  BUILD_EXIT=0
  run_guarded "$VERIFY_TIMEOUT_BUILD" build.log npm run build || BUILD_EXIT=$?
  if [ "$BUILD_EXIT" -ne 0 ]; then
    tail -30 "$VERIFY_LOG_DIR/build.log"
    fail "빌드 실패 (exit: $BUILD_EXIT)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    pass "빌드 성공"
  fi
fi

# ─── E2E 테스트 (--full / --e2e) ──────────────────────────────
# 왜 별도 게이트인가: 이 프로젝트에서 실제로 깨진 채 여러 릴리즈를 통과한 결함들
# (낡은 키바인딩 스펙 3건 · 모달 ESC 무동작)은 전부 tsc·eslint·빌드·단위테스트가
# 구조적으로 못 잡는 종류였다. 머지 전에 한 번은 실제 브라우저에서 돌려야 한다.
if [ "$E2E_MODE" = true ]; then
  header "🎭 E2E 테스트"
  E2E_FILES=$(find e2e -type f \( -name '*.spec.ts' -o -name '*.spec.tsx' \) -print 2>/dev/null | head -1 || true)
  if [ -z "$E2E_FILES" ]; then
    info "E2E 스펙 없음 — 건너뜀"
  elif ! grep -qE '"@playwright/test"' package.json 2>/dev/null; then
    fail "E2E 스펙이 존재하나 @playwright/test 미설치 — 검증 불가"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  elif ! grep -qE '"test:e2e"[[:space:]]*:' package.json 2>/dev/null; then
    fail "E2E 스펙이 존재하나 package.json에 \"test:e2e\" 스크립트 없음"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    E2E_EXIT=0
    run_guarded "$VERIFY_TIMEOUT_E2E" e2e.log npm run test:e2e || E2E_EXIT=$?
    if [ "$E2E_EXIT" -ne 0 ]; then
      tail -40 "$VERIFY_LOG_DIR/e2e.log"
      # 브라우저 미설치는 원인이 명확하므로 처방을 같이 띄운다(로그만 보면 헤맨다).
      if grep -q "Executable doesn't exist\|playwright install" "$VERIFY_LOG_DIR/e2e.log" 2>/dev/null; then
        warn "Playwright 브라우저 미설치로 보인다 — 'npx playwright install chromium' 후 재실행"
      fi
      fail "E2E 실패 (exit: $E2E_EXIT)"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    else
      pass "E2E 통과 ($(grep -oE '[0-9]+ passed' "$VERIFY_LOG_DIR/e2e.log" | tail -1 || echo 'playwright'))"
    fi
  fi
else
  [ "$TS_ONLY" = true ] || info "E2E 건너뜀 — 풀 게이트(--full 또는 --e2e)에서 실행"
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
  rm -rf "${VERIFY_LOG_DIR:?}"   # 통과분 로그는 누적만 됨 (실패·행일 때만 보존)
  exit 0
else
  echo -e "\033[0;31m  ❌ 총 ${FAIL_COUNT}건 문제 발견 — 수정 후 재실행\033[0m"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
