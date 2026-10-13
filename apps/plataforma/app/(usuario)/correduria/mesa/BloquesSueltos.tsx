'use client'

import Link from 'next/link'
import { useState } from 'react'
import { MOTIVOS_PERDIDA_VENTA } from '@central/module-seguros'
import { Badge, btnStyle, cardStyle } from '@/components/ui'
import type { PerdidaPorRevisar } from '@/lib/correduria/expedientes'
import { cuandoRelativo, fechaCorta, ROTULO_MOTIVO_PERDIDA, type Lectura, type TareaSueltaMesa } from '@/lib/correduria/mesa'

const PAGINA = 50
const AMBIGUO = 'No se ha podido confirmar si se guardó: recarga para verlo antes de repetirlo.'

const TITULO: React.CSSProperties = { margin: 0, fontSize: 16, fontWeight: 700 }
const AVISO_LECTURA: React.CSSProperties = { ...cardStyle, borderColor: 'var(--warning)', background: 'var(--warning-bg)', display: 'grid', gap: 4, fontSize: 14 }
const ROTULO_TIPO_TAREA: Record<string, string> = { llamada: 'Llamada', email: 'Correo', whatsapp: 'WhatsApp', tarea: 'Tarea' }

/**
 * «Tareas sueltas»: tareas abiertas SIN oportunidad (no son expediente, pero no pueden perderse). Asegura NO
 * deja cerrarlas ni posponerlas por tarea suelta (el cierre exige oportunidad), así que aquí solo se abre la
 * ficha del cliente: nunca un botón «Hecho» que fallaría.
 * Tres estados: `no_leido` se DICE (no es «no hay»); vacío comprobado no ocupa sitio.
 */
export function TareasSueltas({ lectura, truncado, hoy }: { lectura: Lectura<TareaSueltaMesa>; truncado: boolean; hoy: string }) {
  const [limite, setLimite] = useState(PAGINA)
  if (lectura.estado === 'no_leido') {
    return (
      <section aria-label="Tareas sueltas" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <h2 style={TITULO}>Tareas sueltas</h2>
        <div role="alert" style={AVISO_LECTURA}>
          <strong>No se han podido leer las tareas sueltas.</strong>
          <span>Esto no significa que no haya: son tareas abiertas sin expediente y nadie más las va a mostrar.</span>
        </div>
      </section>
    )
  }
  if (lectura.filas.length === 0 && !truncado) return null
  const filas = lectura.filas
  return (
    <section aria-label="Tareas sueltas" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <h2 style={TITULO}>Tareas sueltas · {filas.length}{truncado ? '+' : ''}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Tareas abiertas que no cuelgan de ningún expediente. Se trabajan en la ficha del cliente.</p>
      {truncado && <p style={{ margin: 0, fontSize: 13, color: 'var(--warning)' }}>La lista está recortada: hay más tareas sueltas de las que se muestran.</p>}
      {filas.slice(0, limite).map(t => (
        <article key={t.tareaId} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {t.clienteId
              ? <Link href={`/correduria/cliente/${t.clienteId}`} style={{ fontWeight: 700, color: 'var(--primary)', overflowWrap: 'anywhere' }}>{t.cliente ?? 'Cliente sin nombre'}</Link>
              : <span style={{ fontWeight: 700, color: 'var(--muted)' }}>Sin cliente asociado</span>}
            <Badge tono="neutral">{ROTULO_TIPO_TAREA[t.tipo] ?? t.tipo}</Badge>
          </div>
          <div style={{ fontSize: 14, display: 'flex', flexWrap: 'wrap', gap: '2px 10px', minWidth: 0 }}>
            <span style={{ overflowWrap: 'anywhere' }}>{t.texto.trim() !== '' ? t.texto : ROTULO_TIPO_TAREA[t.tipo] ?? t.tipo}</span>
            <span style={{ fontWeight: 600, color: t.vencida ? 'var(--negative)' : 'var(--muted)' }}>
              {t.dia ? `${cuandoRelativo(t.dia, hoy)} · ${fechaCorta(t.dia, hoy)}` : 'sin fecha'}
            </span>
          </div>
          {t.clienteId && (
            <div><Link href={`/correduria/cliente/${t.clienteId}`} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>Abrir la ficha</Link></div>
          )}
        </article>
      ))}
      {filas.length > limite && (
        <div><button type="button" style={btnStyle('secundario')} onClick={() => setLimite(l => l + PAGINA)}>Ver {Math.min(PAGINA, filas.length - limite)} más (quedan {filas.length - limite})</button></div>
      )}
    </section>
  )
}

/**
 * «Pérdidas por revisar»: póliza que CIMA da de baja (o que no renovará) SIN sustitución ni expediente. Se
 * resuelve con la acción de siempre (`PATCH /api/correduria/fugas`): «Perdida» con su motivo, o «No es pérdida».
 */
export function PerdidasPorRevisar({ lectura, conExpediente, onCambio }: {
  lectura: Lectura<PerdidaPorRevisar>
  /** Pérdidas no listadas porque su póliza ya tiene expediente. `null` = no consta (no se supone 0). */
  conExpediente: number | null
  onCambio: () => Promise<void>
}) {
  const [limite, setLimite] = useState(PAGINA)
  const [abierta, setAbierta] = useState<string | null>(null)
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; texto: string } | null>(null)

  if (lectura.estado === 'no_leido') {
    return (
      <section aria-label="Pérdidas por revisar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <h2 style={TITULO}>Pérdidas por revisar</h2>
        <div role="alert" style={AVISO_LECTURA}>
          <strong>No se han podido leer las pérdidas de cartera por revisar.</strong>
          <span>Esto no significa que no haya: una póliza que se va sin sustitución es un cliente perdido o un error de CIMA.</span>
        </div>
      </section>
    )
  }
  if (lectura.filas.length === 0) return null // comprobado y no hay: no ocupa sitio
  const filas = lectura.filas

  async function revisar(id: string, resolucion: 'perdida' | 'no_es_perdida') {
    if (resolucion === 'perdida' && !motivo[id]) { setError({ id, texto: 'Elige el motivo de la pérdida.' }); return }
    setOcupado(id)
    setError(null)
    try {
      const r = await fetch('/api/correduria/fugas', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, resolucion, motivo: resolucion === 'perdida' ? motivo[id] : null }),
      })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string } | null
      if (!j?.ok) {
        setError({ id, texto: r.status >= 500 ? AMBIGUO : `No se ha guardado: ${j?.motivo ?? `HTTP ${r.status}`}` })
        return
      }
      setAbierta(null)
      await onCambio() // recarga sin desmontar: la fila se queda hasta que llega la lista nueva
    } catch {
      setError({ id, texto: AMBIGUO })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <section aria-label="Pérdidas por revisar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <h2 style={TITULO}>Pérdidas por revisar · {filas.length}</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
        Pólizas que CIMA da de baja o que no van a renovar, sin sustitución. Decide si es un cliente perdido o no.
        {conExpediente !== null && conExpediente > 0 ? ` ${conExpediente} más ya tienen su expediente abierto y no se listan aquí.` : ''}
      </p>
      {filas.slice(0, limite).map(f => {
        const detalle = [f.aseguradora, f.polizaNumero ? `nº ${f.polizaNumero}` : null, f.motivo, f.anulacion, f.ultimoRecibo].filter(Boolean).join(' · ')
        return (
          <article key={f.id} style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, padding: 14, opacity: ocupado === f.id ? 0.7 : 1 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Link href={`/correduria/cliente/${f.clienteId}`} style={{ fontWeight: 700, color: 'var(--primary)', overflowWrap: 'anywhere' }}>{f.cliente ?? 'Cliente sin nombre'}</Link>
              <Badge tono="negativo">{f.titulo}</Badge>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{detalle || 'póliza sin número'}</div>
            {f.nota && <div style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{f.nota}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" disabled={ocupado !== null} aria-expanded={abierta === f.id}
                style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }} onClick={() => setAbierta(a => (a === f.id ? null : f.id))}>
                {abierta === f.id ? 'Cerrar' : 'Revisar ▾'}
              </button>
            </div>
            {abierta === f.id && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <select aria-label="Motivo de la pérdida" value={motivo[f.id] ?? ''} onChange={e => setMotivo(m => ({ ...m, [f.id]: e.target.value }))}
                  style={{ minHeight: 44, minWidth: 0, maxWidth: '100%', padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="">Motivo…</option>
                  {MOTIVOS_PERDIDA_VENTA.map(m => <option key={m} value={m}>{ROTULO_MOTIVO_PERDIDA[m] ?? m}</option>)}
                </select>
                <button type="button" disabled={ocupado !== null} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, color: 'var(--negative)' }} onClick={() => void revisar(f.id, 'perdida')}>Perdida</button>
                <button type="button" disabled={ocupado !== null} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }} onClick={() => void revisar(f.id, 'no_es_perdida')}>No es pérdida</button>
              </div>
            )}
            {error?.id === f.id && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{error.texto}</p>}
          </article>
        )
      })}
      {filas.length > limite && (
        <div><button type="button" style={btnStyle('secundario')} onClick={() => setLimite(l => l + PAGINA)}>Ver {Math.min(PAGINA, filas.length - limite)} más (quedan {filas.length - limite})</button></div>
      )}
    </section>
  )
}
