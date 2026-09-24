'use client'

// «Hoy» → cartas de nombramiento de mediador (presupuesto, salida B, PR 6). Las firmadas por el cliente
// esperan su OK en «Esperan tu OK» (el correo a la compañía con la carta adjunta); las enviadas, a que la compañía responda. Sin esta
// lista una carta firmada solo se veía entrando en la ficha de su póliza. Se trabajan desde esa ficha.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { LecturaPorTramitar } from '@/lib/carta-mediador-asegura'

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function CartasMediador() {
  const [d, setD] = useState<LecturaPorTramitar | null>(null)
  useEffect(() => {
    fetch('/api/correduria/carta-mediador?pendientes=1')
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      .then((x: LecturaPorTramitar) => setD(x))
      .catch(() => setD({ estado: 'sin_datos', causa: 'red' }))
  }, [])

  if (d === null) return null
  if (d.estado === 'sin_datos') {
    return <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer las cartas de nombramiento ({d.causa}). No significa que no haya.</p>
  }
  if (d.cartas.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Cartas de nombramiento · {d.cartas.length}</span>
      {d.cartas.map(c => (
        <Link key={c.id} href={`/correduria/poliza/${c.polizaId}`}
          style={{ display: 'grid', gap: 2, minHeight: 44, padding: '8px 12px', borderRadius: 12, textDecoration: 'none', color: 'var(--text)',
            border: `1px solid ${c.estado === 'firmada' ? 'var(--negative)' : 'var(--border)'}`, background: 'var(--surface)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
            {c.cliente ?? '(sin nombre)'}{c.compania ? ` · ${c.compania}` : ''}{c.numeroPoliza ? ` · nº ${c.numeroPoliza}` : ''}
          </span>
          <span style={{ fontSize: 12, color: c.estado === 'firmada' ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>
            {c.estado === 'firmada'
              ? `Firmada el ${fechaEs(c.firmadaAt)} · ${c.enCola === true ? 'el correo a la compañía espera tu OK arriba' : c.enCola === false ? 'falta mandarla: no está en la cola, hazlo desde la ficha' : 'falta mandarla a la compañía'}`
              : `Enviada${c.enviadaAt ? ` el ${fechaEs(c.enviadaAt)}` : ''} · esperando que la compañía la acepte`}
          </span>
        </Link>
      ))}
    </div>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
