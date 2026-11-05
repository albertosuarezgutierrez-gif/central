'use client'
import { useState } from 'react'

import { btnStyle } from '@/components/ui'

/**
 * «Pedir datos al cliente por la app» (05/11/2026, Alberto). Para tarificar la renovación de HOGAR con nuestros bots (gratis)
 * cuando al riesgo le faltan datos: rellena con el Catastro lo que pueda y prepara una solicitud con SOLO lo que el bot echa en
 * falta (el mismo validador del 422 `riesgo_incompleto`). Te llega el Telegram con ✅ / ✏️; aquí tienes lo mismo.
 *
 * 🚨 Nada sale al cliente sin pulsar «Enviar al cliente por la app» (o el ✅ del Telegram). Tras el ✅: campana del portal del
 * tomador (y de quien él autoriza con Gestión/Total) + correo de aviso sin datos. Contestar no cotiza ni emite nada.
 */
type Preparada = {
  estado: 'creada' | 'actualizada'
  solicitudId: string
  preguntas: string[]
  catastro: string | null
  destinatarios: string[]
  publicable: boolean
  telegram: boolean
}
type Fase =
  | { f: 'reposo' } | { f: 'preparando' } | { f: 'lista'; d: Preparada } | { f: 'enviando'; d: Preparada }
  | { f: 'enviada'; d: Preparada; ya: boolean } | { f: 'aviso'; texto: string } | { f: 'error'; texto: string; d?: Preparada }

export default function PedirDatosRenovacion({ polizaId }: { polizaId: string }) {
  const [fase, setFase] = useState<Fase>({ f: 'reposo' })

  async function preparar() {
    setFase({ f: 'preparando' })
    try {
      const r = await fetch('/api/correduria/solicitud-renovacion/preparar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ polizaId }) })
      const j = (await r.json().catch(() => null)) as (Preparada & { motivo?: string }) | null
      if (r.ok && j && (j.estado === 'creada' || j.estado === 'actualizada')) setFase({ f: 'lista', d: j })
      // 409 con motivo (nada que pedir, ya enviada, otra solicitud viva…): no es un fallo, es lo que hay.
      else if (r.status === 409 && j?.motivo) setFase({ f: 'aviso', texto: j.motivo })
      else setFase({ f: 'error', texto: j?.motivo ?? `No se ha podido preparar (HTTP ${r.status}). No se ha enviado nada.` })
    } catch {
      setFase({ f: 'error', texto: 'No se ha podido preparar (red). No se ha enviado nada.' })
    }
  }

  async function enviar(d: Preparada) {
    if (!confirm('Se le pide al cliente en su app (campana) y le llega un correo de aviso sin datos. ¿Seguro?')) return
    setFase({ f: 'enviando', d })
    try {
      const r = await fetch('/api/correduria/solicitud-renovacion/publicar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ solicitudId: d.solicitudId }) })
      const j = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (r.ok && (j?.estado === 'publicada' || j?.estado === 'ya_publicada')) setFase({ f: 'enviada', d, ya: j.estado === 'ya_publicada' })
      else setFase({ f: 'error', d, texto: j?.motivo ?? 'No sé si se ha enviado (fallo). Recarga antes de repetir.' })
    } catch {
      setFase({ f: 'error', d, texto: 'No sé si se ha enviado (red). Recarga antes de repetir.' })
    }
  }

  const d = fase.f === 'lista' || fase.f === 'enviando' || fase.f === 'enviada' ? fase.d : fase.f === 'error' ? fase.d : undefined

  return (
    <section id="datos-renovacion" style={{ margin: '16px 0', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <h3 style={{ margin: 0 }}>Pedir datos al cliente por la app</h3>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
        Para tarificar la renovación con los bots (gratis) cuando faltan datos del riesgo. Solo se pregunta lo que les falta.
      </p>
      {!d && (
        <div>
          <button type="button" style={{ ...btnStyle('secundario'), minHeight: 44 }} disabled={fase.f === 'preparando'} onClick={() => void preparar()}>
            {fase.f === 'preparando' ? 'Preparando… (Catastro y datos que faltan)' : 'Preparar solicitud de datos'}
          </button>
        </div>
      )}
      {fase.f === 'aviso' && <p style={{ margin: 0 }}>{fase.texto}</p>}
      {d && (
        <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
          <div><strong>Le preguntaremos:</strong> {d.preguntas.join(', ')}.</div>
          {d.catastro && <div style={{ color: 'var(--muted)', fontSize: 14 }}>{d.catastro}</div>}
          {d.destinatarios.map((l, i) => <div key={i} style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{l}</div>)}
          {!d.telegram && <div style={{ fontSize: 14 }}>⚠️ El Telegram de revisión no ha salido: envíala desde aquí.</div>}
          {fase.f !== 'enviada' && d.publicable && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" style={{ ...btnStyle('primario'), minHeight: 44 }} disabled={fase.f === 'enviando'} onClick={() => void enviar(d)}>
                {fase.f === 'enviando' ? 'Enviando…' : 'Enviar al cliente por la app'}
              </button>
              <button type="button" style={{ ...btnStyle('secundario'), minHeight: 44 }} disabled={fase.f === 'enviando'} onClick={() => void preparar()}>
                Volver a prepararla
              </button>
            </div>
          )}
          {fase.f === 'enviada' && <div>✅ {fase.ya ? 'Ya estaba enviada.' : 'Enviada: le llega a la campana y un correo de aviso sin datos.'}</div>}
        </div>
      )}
      {fase.f === 'error' && <p role="alert" style={{ margin: 0, color: 'var(--negative)' }}>{fase.texto}</p>}
    </section>
  )
}
