'use client'

// «Hoy» → siniestros esperando a la compañía. `null` (no se pudo leer) ≠ `[]` (ninguno). ≥15 días = destacado.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Hourglass } from 'lucide-react'
import Bloque from './Bloque'
import { UMBRAL_ESPERA_DESTACADA, leerEsperando, textoDias, type Esperando } from '@/lib/correduria/siniestro-hilo'

const MOSTRAR = 10
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }

export default function SiniestrosEsperando({ onContador }: { onContador?: (n: number | null) => void }) {
  const [lista, setLista] = useState<Esperando[] | null | undefined>(undefined)
  const [verTodos, setVerTodos] = useState(false)

  useEffect(() => {
    fetch('/api/correduria/siniestros-esperando', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { const l = leerEsperando(j); setLista(l); onContador?.(l === null ? null : l.length) })
      .catch(() => { setLista(null); onContador?.(null) })
  }, [onContador])

  if (lista === undefined) return null
  if (lista === null) {
    return <p role="alert" style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer los siniestros que esperan a la compañía. No significa que no haya.</p>
  }
  if (lista.length === 0) return null

  const urgente = lista.some(e => e.dias >= UMBRAL_ESPERA_DESTACADA)
  const visibles = verTodos ? lista : lista.slice(0, MOSTRAR)
  return (
    <Bloque titulo={`Siniestros esperando a la compañía · ${lista.length}`} Icono={Hourglass} tono={urgente ? 'aviso' : 'neutral'} destacado={urgente}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
        {visibles.map(e => (
          <li key={e.siniestroId}>
            <Link href={`/correduria/siniestro/${e.siniestroId}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', minHeight: 44, fontSize: 14 }}>
              <span style={{ overflowWrap: 'anywhere' }}>Póliza {e.polizaNumero ?? 'sin número'}</span>
              <strong style={{ color: e.dias >= UMBRAL_ESPERA_DESTACADA ? 'var(--negative)' : 'var(--text)', whiteSpace: 'nowrap' }}>{textoDias(e.dias)} ›</strong>
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > MOSTRAR && !verTodos && (
        <button type="button" onClick={() => setVerTodos(true)} style={{ minHeight: 44, font: 'inherit', fontSize: 13, background: 'none', border: 'none', color: 'var(--accent, inherit)', cursor: 'pointer' }}>Ver {lista.length - MOSTRAR} más</button>
      )}
    </Bloque>
  )
}
