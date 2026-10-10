'use client'

// «Hoy» → expedientes de anulación abiertos (ASegura OS, pieza 2-d): qué toca con cada uno.
// Primero los que tienen alarma (falta firma o comunicación con el efecto encima, o CIMA no la
// refleja pasados 15 días). Se trabajan desde la ficha de la póliza.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cuentaAtrasLiberacion, textoDesenlaceAnulacion, type DesenlaceAnulacion, type LecturaAnulaciones } from '@/lib/anulaciones-asegura'

function fechaEs(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export default function Anulaciones() {
  const [d, setD] = useState<LecturaAnulaciones | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const cargar = () =>
    fetch('/api/correduria/anulaciones')
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      .then((x: LecturaAnulaciones) => setD(x))
      .catch(() => setD({ estado: 'sin_datos', causa: 'red' }))
  useEffect(() => { void cargar() }, [])

  // «Liberar para firma»: ya has hablado con el cliente. Una sola vez (asegura contesta 409 a la segunda).
  async function liberar(id: string) {
    setOcupado(id)
    setAviso(null)
    try {
      const r = await fetch('/api/correduria/anulaciones', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, accion: 'liberar' }) })
      const j = (await r.json().catch(() => null)) as { desenlace?: DesenlaceAnulacion; motivo?: string | null } | null
      setAviso(textoDesenlaceAnulacion(j?.desenlace ?? 'error', j?.motivo))
    } catch {
      setAviso(textoDesenlaceAnulacion('error'))
    }
    setOcupado(null)
    await cargar()
  }

  if (d === null) return null
  if (d.estado === 'sin_datos') {
    return <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer las anulaciones en curso ({d.causa}). No significa que no haya.</p>
  }
  if (d.anulaciones.length === 0) return null
  const lista = [...d.anulaciones].sort((a, b) => Number(b.siguiente?.alerta === true) - Number(a.siguiente?.alerta === true))

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>Anulaciones en curso · {lista.length}</span>
      {aviso && <span role="status" style={{ fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{aviso}</span>}
      {lista.map(a => {
        const retenida = a.origen === 'portal' && a.estado === 'solicitada' && a.liberaSolaAt !== null
        return (
          <div key={a.id} style={{ display: 'grid', gap: 4 }}>
            <Link href={`/correduria/poliza/${a.polizaId}`}
              style={{ display: 'grid', gap: 2, minHeight: 44, padding: '8px 12px', borderRadius: 12, textDecoration: 'none', color: 'var(--text)',
                border: `1px solid ${a.siguiente?.alerta ? 'var(--negative)' : 'var(--border)'}`, background: 'var(--surface)' }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>
                {a.origen === 'portal' && <span style={{ fontSize: 11, fontWeight: 700, marginRight: 6, padding: '1px 6px', borderRadius: 8, background: 'var(--primary-light, var(--border))' }}>Pedida por el cliente</span>}
                {a.cliente ?? '(sin nombre)'}{a.compania ? ` · ${a.compania}` : ''} · efecto {fechaEs(a.fechaEfecto)}
              </span>
              {a.origen === 'portal' && a.motivoTexto && <span style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{a.motivoTexto}</span>}
              {a.siguiente && <span style={{ fontSize: 12, color: a.siguiente.alerta ? 'var(--negative)' : 'var(--muted)', overflowWrap: 'anywhere' }}>{a.siguiente.texto}</span>}
              {retenida && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{cuentaAtrasLiberacion(a.liberaSolaAt, new Date())}</span>}
            </Link>
            {retenida && (
              <button type="button" disabled={ocupado === a.id} onClick={() => liberar(a.id)}
                style={{ minHeight: 44, padding: '8px 12px', borderRadius: 12, border: '1px solid var(--primary)', background: 'var(--surface)', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>
                {ocupado === a.id ? 'Liberando…' : 'Liberar para firma'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
