import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { createQueryClient } from './api/query'

// Created once, outside the render, so the cache lives as long as the page
const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* Last resort: a crash anywhere (even in a provider) shows a recovery screen, not a blank page */}
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>,
)
