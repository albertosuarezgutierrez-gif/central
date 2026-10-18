import { Phone } from 'lucide-react'
import { accionesContacto } from '@/lib/acciones-contacto'
import BotonWhatsapp from '../../BotonWhatsapp'

/**
 * «Llamar» y «WhatsApp» con rótulo, a 44 px, bajo el contacto de la cabecera de la ficha.
 *
 * Los iconos sueltos de al lado del nombre (`AccionesContacto`) caben en una línea densa pero en el
 * móvil son un blanco de 32 px; estos son el área táctil completa. Cada uno sale SOLO si hay con qué:
 * sin teléfono no se pinta nada (ni un botón apagado: promete una acción que no existe), y el
 * WhatsApp lo decide `BotonWhatsapp` → `urlWhatsapp()` (fuente única de «esto es un móvil»; sobre un
 * fijo no sale). Dos botones de ~110 px caben a 320 px y, si no, saltan de línea (`flexWrap`).
 */
export default function BotonesContacto({ telefono, quien, mensaje }: {
  telefono: string | null
  /** Para el `aria-label`: «Llamar a Jose Suárez». */
  quien: string
  /** Texto con el que abrir WhatsApp ya escrito (lo redacta `@central/module-seguros`). */
  mensaje?: string | null
}) {
  const a = accionesContacto({ telefono, mensaje })
  if (!telefono || !a.tel) return null
  return (
    <span data-contacto-botones style={{ flexBasis: '100%', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <a
        href={a.tel}
        aria-label={`Llamar a ${quien}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', borderRadius: 999,
          border: '1px solid var(--border)', color: 'inherit', fontWeight: 600, fontSize: 14, textDecoration: 'none', flex: '0 0 auto',
        }}
      >
        <Phone size={16} strokeWidth={2} aria-hidden /> Llamar
      </a>
      <BotonWhatsapp telefono={telefono} mensaje={mensaje} rotulo="WhatsApp" />
    </span>
  )
}
