import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tipografía (Fase 2.5): Space Grotesk en toda la app (display y cuerpo)
import '@fontsource/space-grotesk/400.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
