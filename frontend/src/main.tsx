import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Last resort: a crash anywhere (even in a provider) shows a recovery screen, not a blank page */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
