import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-800.css'
// Estilos (Quadro tático / Placar): fontes empacotadas, nada do Google em tempo de execução
// (a letra de pincel do Quadro tático é a Caveat, declarada como 'Pincel' no index.css)
import '@fontsource/hanken-grotesk/latin-400.css'
import '@fontsource/hanken-grotesk/latin-500.css'
import '@fontsource/hanken-grotesk/latin-600.css'
import '@fontsource/hanken-grotesk/latin-700.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './index.css'
import './styles/responsive.css'
import './styles/lucide-fix.css'
// import './registerSW' // Desabilitado temporariamente para testar login com Supabase
import App from './App.jsx'
import { initOtaUpdates } from './lib/otaUpdater'

// Login único: o link de troca de produto (?codigo=) pode abrir primeiro uma versão antiga em cache,
// que não conhece /entrar-conta e cai no login. Quando a versão nova carrega, volta pra página certa.
if (new URLSearchParams(window.location.search).has('codigo') && !window.location.hash.startsWith('#/entrar-conta')) {
  window.location.hash = '#/entrar-conta';
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Atualização OTA do app nativo (no-op na web). Não bloqueia o render.
initOtaUpdates()

