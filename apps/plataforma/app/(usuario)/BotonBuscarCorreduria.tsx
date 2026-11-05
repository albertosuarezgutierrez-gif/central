'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'

// Import ESTÁTICO a propósito: el panel se monta al pulsar la lupa y `autoFocus` enfoca el input dentro del
// mismo gesto del usuario (con `next/dynamic` el input aparecía tras la carga del chunk, fuera del gesto, y iOS
// no abre el teclado). El coste es el chunk del buscador en el layout; aceptado por la rapidez de toque.
import BuscadorCartera from './correduria/BuscadorCartera'

/**
 * Búsqueda de la correduría desde CUALQUIER pestaña (le llama un cliente y se busca al instante).
 * Reutiliza `BuscadorCartera` (misma API, mismos bloques) sin tocar la URL de la página actual.
 * Atajo «/» (Ctrl/Cmd+K ya es de la paleta de comandos). Quien lo monta decide si hay acceso.
 */
export default function BotonBuscarCorreduria({ variante = 'barra' }: { variante?: 'barra' | 'lateral' }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      setAbierto(true)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [])

  useEffect(() => {
    if (!abierto) return
    function alEscape(e: KeyboardEvent) { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alEscape)
    return () => window.removeEventListener('keydown', alEscape)
  }, [abierto])

  const cerrar = () => setAbierto(false)

  return (
    <>
      {variante === 'barra' ? (
        <button type="button" onClick={() => setAbierto(true)} aria-label="Buscar en la correduría" title="Buscar (/)"
          style={{ minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
          <Search size={20} aria-hidden />
        </button>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} aria-label="Buscar en la correduría" title="Buscar (/)"
          style={{ marginTop: 8, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          <Search size={18} aria-hidden /> Buscar cliente
        </button>
      )}
      {abierto && createPortal(
        <div onClick={cerrar} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '8px 0' }}>
          <div role="dialog" aria-modal="true" aria-label="Buscar en la correduría" onClick={(e) => e.stopPropagation()}
            style={{ width: '95vw', maxWidth: 640, maxHeight: 'calc(100dvh - 16px)', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
              <button type="button" onClick={cerrar} aria-label="Cerrar búsqueda" title="Cerrar (Esc)"
                style={{ minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}>
                <X size={20} aria-hidden />
              </button>
            </div>
            <BuscadorCartera sincronizarUrl={false} autoFocus onNavegar={cerrar} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
