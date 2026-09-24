import Link from 'next/link'
import type { EslabonRiesgoFicha } from '@/lib/poliza-asegura'

/**
 * El historial del RIESGO: por qué pólizas ha pasado este bien (Alberto: «realmente es historial
 * de la póliza, no?» — no, del bien). Una lista, no una tabla: a 320 px una tabla de cinco columnas
 * no se lee. `null` = no se pudo consultar, y se dice; `[]` = esta es la única, y no se pinta nada.
 */
export default function HistorialRiesgo({ lista }: { lista: EslabonRiesgoFicha[] | null }) {
  if (lista === null) {
    return <p style={muted}>No se ha podido consultar el historial de este riesgo ahora.</p>
  }
  if (lista.length === 0) return null
  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🔁 Historial del riesgo</h2>
      <p style={muted}>Las pólizas por las que ha pasado este mismo bien, de la más antigua a la más reciente.</p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {lista.map((e) => (
          <li
            key={e.id}
            style={{
              display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', padding: '8px 10px',
              border: '1px solid var(--border)', borderRadius: 8, borderLeft: e.actual ? '3px solid var(--brand)' : undefined,
            }}
          >
            <strong style={{ minWidth: 0 }}>
              {e.actual ? (
                <>{e.aseguradora ?? 'Compañía sin informar'} · esta póliza</>
              ) : (
                <Link href={`/correduria/poliza/${e.id}`}>{e.aseguradora ?? 'Compañía sin informar'}</Link>
              )}
            </strong>
            <span style={muted}>nº {e.numeroPoliza ?? '—'}</span>
            <span style={muted}>
              {fecha(e.fechaInicio)} → {fecha(e.fechaVencimiento)}
            </span>
            <span style={chip}>{e.sustituida ? 'sustituida' : e.estado}</span>
            {e.via === 'matricula' && <span style={muted}>(misma matrícula, sin enlazar)</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function fecha(iso: string | null): string {
  if (!iso) return '¿?'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const muted: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: 0 }
const chip: React.CSSProperties = { fontSize: 12, padding: '1px 8px', borderRadius: 999, border: '1px solid var(--border)' }
