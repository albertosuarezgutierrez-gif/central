'use client'
import { useState } from 'react'

// Control segmentado del Inicio unificado. Recibe los dos paneles YA renderizados en el servidor
// (dinero = cuerpo de /banca; negocios = holding) y muestra uno u otro sin recargar. Ambos se
// renderizan en SSR (los datos ya vienen cargados), así que cambiar de pestaña es instantáneo.
// El panel inactivo se mantiene montado (display:none) para no perder su estado de cliente
// (filtros del libro, paneles de IA abiertos…) al alternar.
export default function TabsDineroNegocios({
  dinero, negocios, initial = 'dinero',
}: {
  dinero: React.ReactNode
  negocios: React.ReactNode
  initial?: 'dinero' | 'negocios'
}) {
  const [tab, setTab] = useState<'dinero' | 'negocios'>(initial)
  return (
    <div>
      <div role="tablist" aria-label="Dinero o Negocios" style={{
        display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 4, marginBottom: 20, maxWidth: 360,
      }}>
        {(['dinero', 'negocios'] as const).map(k => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            style={{
              flex: 1, font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              border: 0, borderRadius: 9, padding: '9px 8px',
              background: tab === k ? 'var(--surface)' : 'transparent',
              color: tab === k ? 'var(--text)' : 'var(--muted)',
              boxShadow: tab === k ? 'var(--shadow)' : 'none',
            }}
          >
            {k === 'dinero' ? '💶 Dinero' : '🏢 Negocios'}
          </button>
        ))}
      </div>
      <div style={{ display: tab === 'dinero' ? 'block' : 'none' }}>{dinero}</div>
      <div style={{ display: tab === 'negocios' ? 'block' : 'none' }}>{negocios}</div>
    </div>
  )
}
