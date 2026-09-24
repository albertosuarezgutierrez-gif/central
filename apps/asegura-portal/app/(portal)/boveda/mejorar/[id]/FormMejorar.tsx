'use client'
import { useState } from 'react'
import Link from 'next/link'

import {
  CANALES_PRECIO,
  MAX_NOTA_PRECIO,
  MOMENTOS_LLAMADA,
  PRIORIDADES_PRECIO,
  ROTULO_CANAL,
  ROTULO_MOMENTO,
  ROTULO_PRIORIDAD,
  type CanalPrecio,
  type MomentoLlamada,
  type PrioridadPrecio,
} from '@central/module-seguros-portal'

type Estado =
  | { tipo: 'reposo' }
  | { tipo: 'enviando' }
  | { tipo: 'ok'; pedidoEl: string }
  | { tipo: 'rechazo'; motivo: string }
  /** No sabemos si llegó: se dice así, y reintentar es seguro (no crea dos). */
  | { tipo: 'error' }

/**
 * El formulario de «Mejorar el precio». Nada viene marcado de antemano salvo
 * lo que la maqueta aprobó (prioridad «pagar menos», canal «llamada»): son
 * preferencias, no consentimientos, y se cambian con un toque.
 *
 * 🚨 El copy NO promete ni precio ni ahorro (RDL 3/2020): «te decimos si hay
 * algo mejor», no «te lo bajamos».
 */
export function FormMejorar({ polizaId, lectura }: { polizaId: string; lectura: boolean }) {
  const [prioridad, setPrioridad] = useState<PrioridadPrecio>('precio')
  const [canal, setCanal] = useState<CanalPrecio>('llamada')
  const [momento, setMomento] = useState<MomentoLlamada>('igual')
  const [nota, setNota] = useState('')
  const [estado, setEstado] = useState<Estado>({ tipo: 'reposo' })

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    try {
      const r = await fetch('/api/mejorar-precio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ polizaId, prioridad, canal, momento: canal === 'llamada' ? momento : null, nota }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; pedidoEl?: string; motivo?: string } | null
      if (r.ok && j?.estado === 'ok' && j.pedidoEl) return setEstado({ tipo: 'ok', pedidoEl: j.pedidoEl })
      if ((r.status === 422 || r.status === 409) && j?.motivo) return setEstado({ tipo: 'rechazo', motivo: j.motivo })
      setEstado({ tipo: 'error' })
    } catch {
      setEstado({ tipo: 'error' })
    }
  }

  if (estado.tipo === 'ok') {
    return (
      <div className="seccion" role="status">
        <h2 style={{ fontSize: 17 }}>Recibido</h2>
        <p>Lo miramos con las compañías con las que trabajamos y te contactamos {canal === 'llamada' ? 'por teléfono' : 'por correo'} antes de que renueve. No cambiamos nada sin tu OK.</p>
        <p><Link href="/boveda">Volver a mis seguros</Link></p>
      </div>
    )
  }

  const opcion = (activo: boolean): React.CSSProperties => ({
    minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 12,
    border: activo ? '2px solid var(--primary)' : '1px solid var(--border)', fontWeight: activo ? 600 : 400, cursor: 'pointer',
  })

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 20 }}>
      <p style={{ margin: 0 }}>
        Buscamos en las compañías con las que trabajamos y te decimos si hay algo mejor. <strong>No cambiamos nada sin tu OK</strong> y no te cuesta nada.
      </p>

      <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 8 }}>
        <legend style={{ fontWeight: 600, marginBottom: 10 }}>¿Qué te importa más?</legend>
        {PRIORIDADES_PRECIO.map((v) => (
          <label key={v} style={opcion(prioridad === v)}>
            <input type="radio" name="prioridad" checked={prioridad === v} onChange={() => setPrioridad(v)} /> {ROTULO_PRIORIDAD[v]}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 8 }}>
        <legend style={{ fontWeight: 600, marginBottom: 10 }}>¿Cómo te contactamos con la propuesta?</legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          {CANALES_PRECIO.map((v) => (
            <label key={v} style={opcion(canal === v)}>
              <input type="radio" name="canal" checked={canal === v} onChange={() => setCanal(v)} /> {ROTULO_CANAL[v]}
            </label>
          ))}
        </div>
        {canal === 'llamada' && (
          <label style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            Mejor momento para llamarte
            <select value={momento} onChange={(e) => setMomento(e.target.value as MomentoLlamada)} style={{ minHeight: 48, borderRadius: 12, padding: '0 12px', fontSize: 15 }}>
              {MOMENTOS_LLAMADA.map((v) => <option key={v} value={v}>{ROTULO_MOMENTO[v]}</option>)}
            </select>
          </label>
        )}
        <span className="suave" style={{ fontSize: 13 }}>
          Usamos el {canal === 'llamada' ? 'teléfono' : 'correo'} de tu ficha. <Link href="/boveda?vista=datos">¿Ha cambiado? Revísalo en Mis datos</Link>.
        </span>
      </fieldset>

      <label style={{ display: 'grid', gap: 6, fontWeight: 600, fontSize: 14 }}>
        Algo que debamos saber (opcional)
        <textarea
          rows={3}
          maxLength={MAX_NOTA_PRECIO}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej.: este año cambio de coche"
          style={{ borderRadius: 12, padding: '10px 12px', fontSize: 15, fontWeight: 400, resize: 'vertical' }}
        />
      </label>

      {estado.tipo === 'rechazo' && <p role="alert" style={{ margin: 0, color: 'var(--negative)' }}>{estado.motivo}</p>}
      {estado.tipo === 'error' && (
        <p role="alert" style={{ margin: 0, color: 'var(--negative)' }}>
          No hemos podido confirmar que nos haya llegado. Vuelve a pulsar: si ya estaba, no se duplica.
        </p>
      )}

      <button type="submit" className="boton" disabled={lectura || estado.tipo === 'enviando'} style={{ minHeight: 52 }}>
        {estado.tipo === 'enviando' ? 'Enviando…' : 'Pedir mi comparativa'}
      </button>
      {lectura && <p className="suave" style={{ margin: 0, fontSize: 13 }}>Vista de corredor: solo lectura.</p>}
    </form>
  )
}
