import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { captureInstallPrompt } from './pwa'
import { registerServiceWorker } from './registerServiceWorker'
import { applyTheme } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

applyTheme()
captureInstallPrompt()
registerServiceWorker()
