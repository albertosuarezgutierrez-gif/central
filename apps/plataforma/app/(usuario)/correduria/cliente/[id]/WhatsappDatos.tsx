'use client'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import { avisoTrasWhatsapp, enlaceDeRespuestaSolicitud, motivoSinWhatsapp, prepararWhatsappDatos } from '@/lib/correduria/whatsapp-datos'

/**
 * «WhatsApp» de la tarjeta de Oportunidades (30/10/2026): le pide al lead o cliente lo necesario para tarificar.
 * NO envía nada: emite el enlace al formulario `/datos` de esa oportunidad (el mismo mecanismo que «Pedir datos al
 * cliente por enlace») y abre `wa.me` con el mensaje escrito; Alberto lo revisa y pulsa enviar. Queda anotado en el
 * historial como «Datos pedidos por WhatsApp» (informativo: no cuenta como contacto hasta que el cliente responda).
 * Si ya había un enlace vivo, asegura le da token NUEVO a esa misma solicitud (`reemitir`: conserva lo tecleado y el plazo;
 * el enlace anterior deja de valer). Solo si la emisión FALLA el mensaje lista los datos, y el aviso lo dice claro.
 * Sin móvil, el botón sale desactivado y dice por qué.
 */
async function post(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> | null }> {
  try {
    const r = await fetch('/api/correduria/solicitud-datos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { status: r.status, json: (await r.json().catch(() => null)) as Record<string, unknown> | null }
  } catch {
    return { status: 0, json: null }
  }
}

export default function WhatsappDatos({ oportunidadId, ramo, telefono, nombre }: { oportunidadId: string; ramo: string | null; telefono: string | null; nombre: string | null }) {
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  // Sin enlace (la emisión falló) el aviso no puede pasar por uno normal.
  const [sinEnlace, setSinEnlace] = useState(false)
  const [enlace, setEnlace] = useState<string | null>(null)
  const motivo = motivoSinWhatsapp(telefono, ramo)

  async function abrir() {
    setOcupado(true); setAviso(null); setEnlace(null); setSinEnlace(false)
    // Se abre la pestaña YA (dentro del clic) y se rellena después: si no, el navegador bloquea el popup tras el fetch.
    const ventana = window.open('', '_blank')
    try {
      const r = await post({ oportunidadId, reemitir: true })
      const { url, motivo: motivoSinEnlace } = enlaceDeRespuestaSolicitud(r.status, r.json)
      const wa = prepararWhatsappDatos({ telefono, nombre, ramo, url })
      if (!wa.ok) { ventana?.close(); setAviso(wa.motivo); return }
      if (ventana) ventana.location.href = wa.href
      else setEnlace(wa.href)
      const nota = await post({ accion: 'whatsapp', oportunidadId, conEnlace: wa.conEnlace })
      setSinEnlace(!wa.conEnlace)
      setAviso(avisoTrasWhatsapp({ conEnlace: wa.conEnlace, motivoSinEnlace, notaStatus: nota.status }))
    } catch {
      ventana?.close()
      setAviso('No se ha podido preparar el WhatsApp.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <button
        type="button"
        disabled={ocupado || motivo !== null}
        onClick={() => void abrir()}
        title={motivo ?? 'Abre WhatsApp con el mensaje y el enlace al formulario ya escritos: lo envías tú'}
        style={{ ...btnStyle('sutil', 'sm'), minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <MessageCircle size={16} strokeWidth={1.75} aria-hidden /> {ocupado ? 'Preparando…' : 'WhatsApp'}
      </button>
      {motivo !== null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{motivo}</span>}
      {enlace && <a href={enlace} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--primary)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>El navegador bloqueó la pestaña: abrir WhatsApp</a>}
      {aviso && <span role={sinEnlace ? 'alert' : 'status'} style={{ fontSize: 12, color: sinEnlace ? 'var(--warning)' : 'var(--muted)', fontWeight: sinEnlace ? 600 : undefined, overflowWrap: 'anywhere' }}>{aviso}</span>}
    </div>
  )
}
