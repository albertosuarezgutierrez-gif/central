'use client'

// «Hoy» → expedientes de anulación abiertos (ASegura OS, pieza 2-d): qué toca con cada uno.
// Primero los que tienen alarma (falta firma o comunicación con el efecto encima, o CIMA no la
// refleja pasados 15 días). Se trabajan desde la ficha de la póliza.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { LecturaAnulaciones } from '@/lib/anulaciones-asegura'

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function Anulaciones() {
  const [d, setD] = useState<LecturaAnulaciones | null>(null)
  useEffect(() => {
    fetch('/api/correduria/anulaciones')
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      .then((x: LecturaAnulaciones) => setD(x))
      .catch(() => setD({ estado: 'sin_datos', causa: 'red' }))
  }, [])

  if (d === null) return null
  if (d.estado === 'sin_datos') {
    return <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer las anulaciones en curso ({d.causa}). No significa que no haya.</p>
  }
  if (d.anulaciones.length === 0) return null
  const lista = [...d.anulaciones].sort((a, b) => Number(b.siguiente?.alerta === true) - Number(a.siguiente?.alerta === true))

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Anulaciones en curso · {lista.length}</span>
      {lista.map(a => (
        <Link key={a.id} href={`/correduria/poliza/${a.polizaId}`}
          style={{ display: 'grid', gap: 2, minHeight: 44, padding: '8px 12px', borderRadius: 12, textDecoration: 'none', color: 'var(--text)',
            border: `1px solid ${a.siguiente?.alerta ? 'var(--negative)' : 'var(--border)'}`, background: 'var(--surface)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
            {a.cliente ?? '(sin nombre)'}{a.compania ? ` · ${a.compania}` : ''} · efecto {fechaEs(a.fechaEfecto)}
          </span>
          {a.siguiente && <span style={{ fontSize: 12, color: a.siguiente.alerta ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{a.siguiente.texto}</span>}
        </Link>
      ))}
    </div>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
