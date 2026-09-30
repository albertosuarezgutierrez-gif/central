'use client'
import { useState } from 'react'
import { btnStyle } from '@/components/ui'
import { MOTIVOS_PERDIDA_UI, RESPUESTAS_WHATSAPP_UI, type RespuestaWhatsappUI } from '@/lib/seguimiento-asegura'

/**
 * Qué contestó el lead al WhatsApp (Alberto, 30/09/2026). Se registra por el
 * mismo camino que el resultado de una llamada, con `canal: 'whatsapp'`: asegura
 * lo aplica en una transacción (registro + estado + siguiente tarea). «Pidió la
 * baja» además le quita el WhatsApp y el correo en su ficha, y por eso se confirma.
 */
export default function RespuestaLead({ oportunidadId, onHecho }: {
  oportunidadId: string
  onHecho: (r: RespuestaWhatsappUI) => void
}) {
  const [resultado, setResultado] = useState<RespuestaWhatsappUI | ''>('')
  const [volverEl, setVolverEl] = useState(manana())
  const [motivo, setMotivo] = useState<string>('ya_asegurado')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!resultado) return
    if (resultado === 'baja' && !window.confirm('Marca que no quiere más mensajes: no se le podrá volver a escribir por WhatsApp ni por correo. ¿Seguro?')) return
    setOcupado(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/oportunidad/llamada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          oportunidadId, resultado, canal: 'whatsapp',
          ...(resultado === 'otro_dia' ? { volverEl } : {}),
          ...(resultado === 'no_interesa' ? { motivo } : {}),
        }),
      })
      const json = (await r.json().catch(() => null)) as { estado?: string; motivo?: string } | null
      if (!r.ok || json?.estado !== 'ok') { setError(json?.motivo ?? `No se ha guardado (HTTP ${r.status}).`); return }
      onHecho(resultado)
    } catch {
      setError('Sin conexión: no se sabe si se guardó. Recarga antes de repetirlo.')
    } finally {
      setOcupado(false)
    }
  }

  const campo = { minHeight: 44, borderRadius: 8, border: '1px solid var(--border)', padding: '0 10px', fontSize: 14, background: 'var(--surface)', color: 'var(--text)', maxWidth: '100%' } as const
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexBasis: '100%' }}>
      <select aria-label="Respuesta al WhatsApp" value={resultado} onChange={e => { setResultado(e.target.value as RespuestaWhatsappUI | ''); setError(null) }} style={campo}>
        <option value="">¿Qué respondió?</option>
        {RESPUESTAS_WHATSAPP_UI.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
      {resultado === 'otro_dia' && (
        <input type="date" aria-label="Día para llamarle" value={volverEl} min={manana()} onChange={e => setVolverEl(e.target.value)} style={campo} />
      )}
      {resultado === 'no_interesa' && (
        <select aria-label="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} style={campo}>
          {MOTIVOS_PERDIDA_UI.filter(m => m.valor !== 'otro').map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
        </select>
      )}
      {resultado && (
        <button type="button" disabled={ocupado} onClick={() => void guardar()} style={{ ...btnStyle('primario', 'sm'), minHeight: 44 }}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
      )}
      {error && <span role="alert" style={{ fontSize: 13, color: 'var(--negative)', flexBasis: '100%' }}>{error}</span>}
    </div>
  )
}

function manana(): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
