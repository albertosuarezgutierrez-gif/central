'use client'

// Selector de tema: Claro ↔ Oscuro. Persiste en localStorage('theme') y aplica
// html[data-theme]. NO hay modo "auto" que siga al sistema: el ahorro de batería
// del móvil ponía el sistema en oscuro y el panel se oscurecía solo (03/07/2026).
// El script anti-parpadeo del layout raíz aplica el oscuro guardado antes del
// primer pintado; sin elección, el claro por defecto de globals.css.
import { useEffect, useState } from 'react'

type Tema = 'light' | 'dark'
const ETIQUETA: Record<Tema, string> = { light: '☀️ Claro', dark: '🌙 Oscuro' }

function aplicar(t: Tema) {
  document.documentElement.dataset.theme = t
  // "only light" veta el oscurecimiento forzado del navegador (ahorro de batería);
  // theme-color pinta la barra del navegador acorde al tema elegido.
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', t === 'light' ? 'only light' : 'dark')
  const color = document.querySelector('meta[name="theme-color"]')
  if (color) color.setAttribute('content', t === 'light' ? '#4f46e5' : '#0b1220')
}

export default function ThemeToggle() {
  // Arranca en 'light' para que servidor y cliente rendericen lo mismo (sin
  // hydration mismatch); tras montar se lee la elección guardada.
  const [tema, setTema] = useState<Tema>('light')
  useEffect(() => {
    try {
      if (localStorage.getItem('theme') === 'dark') setTema('dark')
    } catch { /* localStorage bloqueado: se queda en claro */ }
  }, [])

  function ciclar() {
    const sig: Tema = tema === 'light' ? 'dark' : 'light'
    setTema(sig)
    aplicar(sig)
    try {
      localStorage.setItem('theme', sig)
    } catch { /* sin persistencia */ }
  }

  return (
    <button
      onClick={ciclar}
      title="Cambiar entre tema claro y oscuro"
      style={{
        width: '100%', padding: '7px', fontSize: '13px', marginBottom: '8px',
        border: '1px solid var(--border)', borderRadius: '8px',
        color: 'var(--muted)', background: 'transparent', cursor: 'pointer',
      }}
    >{ETIQUETA[tema]}</button>
  )
}
