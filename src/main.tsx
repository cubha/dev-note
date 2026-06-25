import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'jotai'
import './index.css'
import App from './App.tsx'
import { initAnalytics } from './shared/utils/analytics'

initAnalytics() // 방문 계측 (VITE_ANALYTICS_ENDPOINT 설정 시에만 활성)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>,
)
