'use client'

// «Pérdidas de cartera» en Hoy (Fase 2 de ASegura OS, pieza 2-a): pólizas que CIMA da de baja,
// que anuncian que no renovarán o que dejan de aparecer, SIN sustitución registrada. Cada una se
// cierra con una resolución cerrada: «perdida» con su motivo, o «no es pérdida». Nada de texto
// libre (la revisión queda en una tabla que no se borra).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { btnStyle } from '@/components/ui'
import type { Fuga } from '@/lib/fugas-cartera'

type Estado =
  | { estado: 'ok'; fugas: Fuga[]; motivos: string[] }
  | { estado: 'sin_datos'; causa: string }

const ROTULO_MOTIVO: Record<string, string> = {
  precio: 'Precio',
  competidor: 'Se fue a otro corredor/compañía',
  coberturas: 'Coberturas',
  cliente_desiste: 'Ya no lo necesita',
  sin_respuesta: 'Sin respuesta',
  no_contactable: 'No contactable',
  ya_asegurado: 'Ya estaba asegurado',
  otro: 'Otro',
}

export default function PerdidasCartera() {
  const [d, setD] = useState<Estado | null>(null)
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    fetch('/api/correduria/fugas')
      .then(r => (r.ok ? r.json() : { estado: 'sin_datos', causa: `HTTP ${r.status}` }))
      .then((x: Estado) => setD(x))
      .catch(() => setD({ estado: 'sin_datos', causa: 'red' }))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function revisar(id: string, resolucion: 'perdida' | 'no_es_perdida') {
    if (resolucion === 'perdida' && !motivo[id]) { setError('Elige el motivo de la pérdida.'); return }
    setOcupado(id); setError(null)
    try {
      const r = await fetch('/api/correduria/fugas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolucion, motivo: motivo[id] ?? null }),
      })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null
      if (!j?.ok) setError(`No se ha guardado: ${j?.motivo ?? `HTTP ${r.status}`}`)
      cargar()
    } catch {
      setError('No se ha guardado: sin conexión')
    } finally {
      setOcupado(null)
    }
  }

  const n = d?.estado === 'ok' ? d.fugas.length : null
  if (d?.estado === 'ok' && n === 0) return null // comprobado y no hay: no ocupa sitio en Hoy

  return (
    <section id="perdidas" style={{ display: 'grid', gap: 6 }}>
      <h2 style={TITULO}>Pérdidas de cartera por revisar{n ? ` · ${n}` : ''}</h2>
      {d === null && <p style={NOTA}>Cargando…</p>}
      {d?.estado === 'sin_datos' && (
        <p style={{ ...NOTA, color: 'var(--negative)' }}>No se han podido leer ({d.causa}). No significa que no haya.</p>
      )}
      {d?.estado === 'ok' && d.fugas.slice(0, 30).map(f => (
        <div key={f.id} style={{ display: 'grid', gap: 6, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
          <Link href={`/correduria/cliente/${f.clienteId}`} style={{ display: 'grid', gap: 2, minWidth: 0, color: 'var(--text)', textDecoration: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 600, overflowWrap: 'anywhere' }}>{f.titulo} · {f.cliente ?? '(ficha sin nombre)'}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {[f.aseguradora, f.polizaNumero ? `nº ${f.polizaNumero}` : null, f.estado ? `estado ${f.estado}` : null].filter(Boolean).join(' · ') || 'póliza sin número'}
            </span>
          </Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select
              aria-label="Motivo de la pérdida"
              value={motivo[f.id] ?? ''}
              onChange={e => setMotivo(m => ({ ...m, [f.id]: e.target.value }))}
              style={{ minHeight: 44, minWidth: 0, maxWidth: '100%', padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="">Motivo…</option>
              {d.motivos.map(m => <option key={m} value={m}>{ROTULO_MOTIVO[m] ?? m}</option>)}
            </select>
            <button type="button" disabled={ocupado !== null} onClick={() => void revisar(f.id, 'perdida')} style={btnStyle('secundario')}>Perdida</button>
            <button type="button" disabled={ocupado !== null} onClick={() => void revisar(f.id, 'no_es_perdida')} style={btnStyle('sutil')}>No es pérdida</button>
          </div>
        </div>
      ))}
      {d?.estado === 'ok' && d.fugas.length > 30 && <p style={NOTA}>…y {d.fugas.length - 30} más.</p>}
      {error && <p role="alert" style={{ ...NOTA, color: 'var(--negative)' }}>{error}</p>}
    </section>
  )
}

const TITULO: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }
const NOTA: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--muted)' }
