'use client'
import BotonWhatsapp from '../BotonWhatsapp'
import { whatsappDeLead, type LeadVencimiento } from '@/lib/seguimiento-asegura'

/**
 * WhatsApp de seguimiento de un lead, con el mensaje ya escrito (Alberto,
 * 23/09/2026: es la vía de contacto preferente; no automático). Se abre en su
 * WhatsApp y lo envía él; al pulsar se anota el contacto en asegura para que
 * cuente como intento. No pinta nada si no se le puede escribir por ahí
 * (nunca fue cliente, o el número no es un móvil).
 */
export default function WhatsappLead({ lead, onRegistrado }: { lead: LeadVencimiento; onRegistrado?: () => void }) {
  const wa = whatsappDeLead(lead)
  if (!wa) return null
  return (
    <BotonWhatsapp
      telefono={wa.telefono}
      mensaje={wa.mensaje}
      onAbrir={() => {
        // Sin `await` ni `preventDefault`: WhatsApp se abre aunque el registro tarde o falle.
        fetch('/api/correduria/oportunidad/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ oportunidadId: lead.oportunidadId }),
        }).then(r => { if (r.ok) onRegistrado?.() }).catch(() => {})
      }}
    />
  )
}
