현재 프로젝트 루트의 `package.json`을 읽어서 기술 스택을 파악한 뒤, 프로젝트에 최적화된 `verify.sh`를 프로젝트 루트에 생성한다.

## 분석 순서

1. `package.json` 읽기 (dependencies, devDependencies, scripts 확인)
2. 아래 기준으로 스택 감지:
   - `next` 포함 → Next.js 프로젝트
   - `vite` 포함 (next 없음) → Vite 프로젝트
   - `typescript` 또는 `tsc` 포함 → TypeScript 체크 추가
   - `eslint` 포함 → ESLint 단계 추가
   - `vitest` 포함 → 테스트 단계 추가
   - `jest` 포함 → 테스트 단계 추가
3. `verify.sh` 생성 (프로젝트 루트)

## verify.sh 템플릿 규칙

- 첫 줄: `#!/bin/bash`
- `set -e` (실패 즉시 중단)
- 각 단계마다 `echo` 로 진행 상황 출력 (한국어, 이모지 포함)
- 마지막 줄: `echo "✅ 모든 검증 통과"`
- 패키지 매니저는 package.json의 `packageManager` 필드 또는 lock 파일로 자동 감지
  - `bun.lockb` 존재 → `bun`
  - `pnpm-lock.yaml` 존재 → `pnpm`
  - `yarn.lock` 존재 → `yarn`
  - 그 외 → `npm`

## 단계 순서 (해당하는 것만 포함)

1. **TypeScript 타입 체크**: `{pkgManager} exec tsc --noEmit`
2. **ESLint**: `{pkgManager} exec eslint . --ext .ts,.tsx,.js,.jsx --max-warnings 0`
3. **테스트** (vitest/jest 있을 때): `{pkgManager} run test --run` (vitest) 또는 `{pkgManager} run test --watchAll=false` (jest)
4. **빌드 검증**: `{pkgManager} run build`

## 완료 후

- 생성된 `verify.sh` 내용을 출력해서 사용자가 확인할 수 있게 한다
- Windows 환경에서는 Git Bash / WSL 에서 실행해야 함을 안내한다
- 실행 방법: `bash verify.sh`
