'use client'
import { useState } from 'react'
import type { GrupoCimaExtra } from '@/lib/cima-extra-vista'

const MAX = 50
const muted = { margin: 0, fontSize: 13, color: 'var(--muted)' } as const

/**
 * «Más datos de CIMA»: los campos EIAC que ningún extractor lee (solo intranet del operador).
 * `grupos === null` = aún no se ha leído: NO se pinta «sin datos». `[]` = CIMA no trae más.
 * Regla de rendimiento: 50 filas + «Ver más».
 */
export default function MasDatosCima({ grupos, truncado }: { grupos: GrupoCimaExtra[] | null; truncado: boolean }) {
  const [limite, setLimite] = useState(MAX)
  if (grupos === null) return null
  const total = grupos.reduce((n, g) => n + g.filas.length, 0)
  let restantes = limite
  const visibles = grupos
    .map((g) => {
      const filas = g.filas.slice(0, Math.max(restantes, 0))
      restantes -= filas.length
      return { ...g, filas }
    })
    .filter((g) => g.filas.length > 0)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      {total === 0 && <p style={muted}>CIMA no trae más datos de esta póliza.</p>}
      {truncado && <p style={{ ...muted, color: 'var(--warning)' }}>La lista está cortada a 400 campos: CIMA manda más de los que se guardan.</p>}
      {visibles.map((g) => (
        <section key={g.titulo} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
          <h3 style={{ fontSize: 13, margin: 0, fontWeight: 700 }}>{g.titulo}</h3>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
            {g.filas.map((f, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)', gap: 8, fontSize: 13 }}>
                <dt style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{f.etiqueta}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{f.valor}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {total > limite && (
        <button type="button" onClick={() => setLimite((l) => l + MAX)} style={{ minHeight: 44, cursor: 'pointer' }}>
          Ver más ({total - limite} restantes)
        </button>
      )}
    </div>
  )
}
