import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3002/dev-note/',
    headless: true,
  },
  webServer: {
    // ⚠ `npm run dev`가 아니라 `dev:e2e`여야 한다. `npm run dev`는 vite.config.ts의 port 3001로 뜨는데
    // 여기 url은 3002라, 서버가 정상 기동해도 playwright가 영원히 준비를 기다리다 타임아웃한다
    // (실측: "Timed out waiting 60000ms from config.webServer"). 그래서 E2E가 그냥 안 돌았고,
    // 낡아서 깨진 스펙 3건이 여러 릴리즈 동안 방치됐다.
    //
    // 포트를 3001로 맞추지 않고 3002를 유지하는 이유: origin이 달라야 IndexedDB가 분리된다.
    // 같은 포트를 쓰면 E2E의 시드·삭제가 개발자가 띄워 둔 dev 서버의 실제 데이터를 건드린다.
    command: 'npm run dev:e2e',
    url: 'http://localhost:3002/dev-note/',
    reuseExistingServer: true,
    // WSL2 /mnt/d는 첫 기동이 느리다(60s로는 부족). 기동 실패가 아니라 대기 부족으로 깨지지 않게.
    timeout: 180000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
