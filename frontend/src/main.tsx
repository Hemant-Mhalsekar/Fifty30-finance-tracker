import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { initMonitoring } from './monitoring'
import { captureInstallPrompt } from './pwa'
import { registerServiceWorker } from './registerServiceWorker'
import { applyTheme } from './theme'

// First, so errors during start-up are reported too.
initMonitoring()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)

applyTheme()
captureInstallPrompt()
registerServiceWorker()
