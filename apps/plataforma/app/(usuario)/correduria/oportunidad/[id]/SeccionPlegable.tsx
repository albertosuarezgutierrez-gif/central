'use client'

// Sección PLEGADA de la pantalla del riesgo (21/10/2026, Alberto: «la pantalla es muy larga; que todo quede plegado»). Mismo
// patrón que `SeccionCard plegable` de components/ui.tsx (`<details>` nativo + `.seccion-chev`), con dos cosas más:
//   · PEREZOSA: el contenido no se monta (ni lee nada) hasta abrirla la primera vez; luego se queda montado (no se pierde lo
//     tecleado al plegar). `perezosa={false}` lo monta desde el principio, oculto (lo que tiene que leer para el resto de la página).
//   · Una línea de RESUMEN en la cabecera, para saber qué hay dentro sin abrirla.
// `<details>` sin `open` controlado: React no la vuelve a cerrar al repintar. `abrirSeccion(id)` la abre y lleva a ella.
import { useState, type ReactNode } from 'react'
import { cardStyle } from '@/components/ui'

export type TonoResumen = 'normal' | 'aviso' | 'falta' | 'bien'
const COLOR: Record<TonoResumen, string> = { normal: 'var(--muted)', aviso: 'var(--warning)', falta: 'var(--negative)', bien: 'var(--positive)' }

export default function SeccionPlegable({ id, titulo, resumen, tono = 'normal', perezosa = true, children }: {
  id: string
  titulo: string
  resumen?: ReactNode
  tono?: TonoResumen
  perezosa?: boolean
  children: ReactNode
}) {
  const [montada, setMontada] = useState(!perezosa)
  return (
    <details id={id} className="seccion-plegable" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setMontada(true) }}
      style={{ ...cardStyle, padding: '4px 16px', minWidth: 0, scrollMarginTop: 8 }}>
      <summary style={{ cursor: 'pointer', minHeight: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', listStyle: 'none' }}>
        <span className="seccion-chev" aria-hidden style={{ color: 'var(--muted)', fontSize: 12, flex: 'none' }}>▸</span>
        <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{titulo}</span>
          {resumen && <span style={{ fontFamily: 'var(--font-marca-sans), system-ui, sans-serif', fontSize: 13, fontWeight: 600, color: COLOR[tono], overflowWrap: 'anywhere' }}>{resumen}</span>}
        </span>
      </summary>
      <div className="seccion-plegable-cuerpo" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, padding: '4px 0 16px', minWidth: 0 }}>
        {montada && children}
      </div>
    </details>
  )
}

/** Abre la sección (si estaba plegada, la monta) y la trae a la vista. `dentro`: id de un elemento de dentro al que ir. */
export function abrirSeccion(id: string, dentro?: string) {
  const d = document.getElementById(id)
  if (d instanceof HTMLDetailsElement && !d.open) d.open = true
  // Tras montar el contenido (el `toggle` llega en el siguiente ciclo): el scroller de plataforma es `LayoutShell`, `scrollIntoView` vale.
  window.setTimeout(() => {
    const destino = (dentro ? document.getElementById(dentro) : null) ?? document.getElementById(id)
    destino?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 60)
}
