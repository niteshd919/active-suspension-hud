import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initTheme } from './a11y/useSettingsStore'
import App from './App'
import { ViewportGate } from './ViewportGate'
import './index.css'

// Colours must be applied before the first render: the 3D materials read them at creation.
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewportGate>
      <App />
    </ViewportGate>
  </StrictMode>,
)
