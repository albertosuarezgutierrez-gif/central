'use client'

// Selector de tema: Auto (sigue al sistema) → Claro → Oscuro. Persiste en
// localStorage('theme') y aplica html[data-theme]; sin elección, mandan las
// media queries de globals.css. El script anti-parpadeo del layout raíz aplica
// la elección guardada antes del primer pintado.
import { useEffect, useState } from 'react'

type Tema = 'auto' | 'light' | 'dark'
const ORDEN: Tema[] = ['auto', 'light', 'dark']
const ETIQUETA: Record<Tema, string> = { auto: '🌗 Auto', light: '☀️ Claro', dark: '🌙 Oscuro' }

function aplicar(t: Tema) {
  const el = document.documentElement
  if (t === 'auto') delete el.dataset.theme
  else el.dataset.theme = t
  // "only light" veta el oscurecimiento forzado del navegador (ahorro de batería)
  // cuando el usuario elige Claro; en auto vuelve a "light dark".
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) meta.setAttribute('content', t === 'light' ? 'only light' : t === 'dark' ? 'dark' : 'light dark')
}

export default function ThemeToggle() {
  // Arranca en 'auto' para que servidor y cliente rendericen lo mismo (sin
  // hydration mismatch); tras montar se lee la elección guardada.
  const [tema, setTema] = useState<Tema>('auto')
  useEffect(() => {
    try {
      const t = localStorage.getItem('theme')
      if (t === 'light' || t === 'dark') setTema(t)
    } catch { /* localStorage bloqueado: se queda en auto */ }
  }, [])

  function ciclar() {
    const sig = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length]
    setTema(sig)
    aplicar(sig)
    try {
      if (sig === 'auto') localStorage.removeItem('theme')
      else localStorage.setItem('theme', sig)
    } catch { /* sin persistencia */ }
  }

  return (
    <button
      onClick={ciclar}
      title="Tema: Auto sigue al sistema"
      style={{
        width: '100%', padding: '7px', fontSize: '13px', marginBottom: '8px',
        border: '1px solid var(--border)', borderRadius: '8px',
        color: 'var(--muted)', background: 'transparent', cursor: 'pointer',
      }}
    >{ETIQUETA[tema]}</button>
  )
}
