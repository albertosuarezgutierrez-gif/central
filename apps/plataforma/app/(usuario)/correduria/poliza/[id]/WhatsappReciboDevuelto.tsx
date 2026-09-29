'use client'

// WhatsApp al cliente por un recibo DEVUELTO, con el mensaje ya escrito (Alberto, 29/09/2026).
// Se abre en su WhatsApp y lo envía él; al pulsar se anota en el historial de la ficha que se
// ABRIÓ (no que se envió: eso no lo sabemos). El texto lo compone `mensajeReciboDevueltoWhatsapp`
// de @central/module-seguros, donde pasa los cepos de copy regulado.

import { useEffect, useState } from 'react'
import { mensajeReciboDevueltoWhatsapp, type EntradaWhatsappDevuelto } from '@central/module-seguros'
import BotonWhatsapp from '../../BotonWhatsapp'
import { eur } from '@/lib/dinero'

export type ContextoWhatsappDevuelto = Omit<EntradaWhatsappDevuelto, 'importe' | 'fechaEfecto' | 'tipoMotivo' | 'ahora'> & {
  clienteId: string
  telefono: string
  /** De quién es el móvil cuando no es del tomador («Juan, conductor habitual»). */
  quien: string | null
}

export default function WhatsappReciboDevuelto({ ctx, importe, fechaEfecto, tipoMotivo, grande = false }: {
  ctx: ContextoWhatsappDevuelto
  importe: number | null
  fechaEfecto: string | null
  tipoMotivo: string | null
  /** Botón con rótulo (el «Siguiente paso» de la ficha) en vez del icono de la tabla de recibos. */
  grande?: boolean
}) {
  // El saludo depende de la hora: se calcula en el navegador, no en el servidor.
  const [ahora, setAhora] = useState<Date | null>(null)
  useEffect(() => setAhora(new Date()), [])
  if (!ahora) return null

  const { clienteId, telefono, quien, ...resto } = ctx
  const mensaje = mensajeReciboDevueltoWhatsapp({ ...resto, importe, fechaEfecto, tipoMotivo, ahora })

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <BotonWhatsapp
        telefono={telefono}
        mensaje={mensaje}
        compacto={!grande}
        rotulo={grande ? 'WhatsApp' : undefined}
        onAbrir={() => {
          // Sin `await`: WhatsApp se abre aunque la nota tarde o falle.
          const texto = `💬 WhatsApp abierto por el recibo devuelto${importe !== null ? ` de ${eur(importe)}` : ''}${quien ? ` (a ${quien})` : ''}. Pendiente de confirmar que se envió y de su respuesta.`
          fetch('/api/correduria/cliente/nota', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clienteId, texto }),
          }).catch(() => {})
        }}
      />
      {quien && <span style={{ fontSize: 12, color: 'var(--warning)' }} title="El tomador no tiene móvil en su ficha">al móvil de {quien}</span>}
    </span>
  )
}
