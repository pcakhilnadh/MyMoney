import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { SyncProvider } from './sync/SyncProvider'

const queryClient = new QueryClient()

import { seedIfEmpty } from './db/seed'

void seedIfEmpty()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
