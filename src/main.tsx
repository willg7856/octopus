import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { VercelInsights } from './components/VercelInsights'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <VercelInsights />
  </StrictMode>,
)
