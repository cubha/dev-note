import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/dev-note/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3001,
  },
  test: {
    environment: 'node',
    globals: true,
    // .tsx도 포함 — data-search-path 계약 검사는 컴포넌트를 실제로 렌더해서 확인한다
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
