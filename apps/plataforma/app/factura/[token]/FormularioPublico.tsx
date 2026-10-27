'use client'
import { useState } from 'react'
import DatosFiscalesForm, { type DatosFiscales, type RespuestaEnvio } from '@/components/factura/DatosFiscalesForm'

export default function FormularioPublico({ token, yaCompletada }: { token: string; yaCompletada: boolean }) {
  const [hecho, setHecho] = useState(false)
  const base = `/api/publico/factura/${encodeURIComponent(token)}`
  async function enviar(d: DatosFiscales): Promise<RespuestaEnvio> {
    const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setHecho(true); return { ok: true } }
    if (r.status === 429) return { ok: false, error: 'Demasiados intentos: prueba en unos minutos. / Too many attempts, try again later.' }
    return { ok: false, error: j.error || 'No se ha podido enviar. / Could not send.', errores: j.errores }
  }
  if (hecho) {
    return <p role="status" style={{ fontSize: 16 }}>¡Gracias! Hemos recibido tus datos: te enviaremos la factura por correo. / Thank you! We have received your details and will email you the invoice.</p>
  }
  return (
    <>
      {yaCompletada && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Ya nos enviaste tus datos. Si los vuelves a enviar, sustituyen a los anteriores. / You already sent your details; sending again replaces them.</p>}
      <DatosFiscalesForm
        urlCp={(cp) => `${base}/cp?cp=${encodeURIComponent(cp)}`}
        urlVias={(provincia, municipio, q) => `${base}/vias?${new URLSearchParams({ provincia, municipio, q })}`}
        onEnviar={enviar}
      />
    </>
  )
}
