import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/Crashed.jsx'
import { installErrorReporting } from './lib/crash.js'
import { installPwa } from './lib/pwa.js'
import { installViewport } from './lib/viewport.js'
import './index.css'

installErrorReporting()
installPwa()
installViewport()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
