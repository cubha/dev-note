import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/dev-note/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3001,  // 원하는 포트
  },
})
