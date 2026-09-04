import { Phone, Mail, MessageCircle } from 'lucide-react'
import { btnIcono } from '@/components/ui'
import { accionesContacto } from '@/lib/acciones-contacto'

/**
 * Llamar · escribir · WhatsApp, al lado del nombre de un cliente.
 *
 * Petición de Alberto (04/09/2026): «al lado de cada nombre cliente aparezca
 * icono tlf para poder llamarlo, mail y whassap». La norma es que aparezca
 * SIEMPRE que haya con qué — no que aparezca siempre.
 *
 * 🚨 El WhatsApp se OMITE en los fijos. El veredicto lo da `accionesContacto`
 * (puro y testeado, con los dos números reales de su ficha): un icono de
 * WhatsApp sobre un 954… es una acción que falla, y ofrecerla es de la misma
 * familia que afirmar un dato sin mirarlo. Lo que no se sabe (un extranjero) sí
 * se ofrece, declarándolo en el `title`: solo se esconde lo que se sabe roto.
 *
 * Server-safe: son enlaces, no handlers. Se puede montar desde un server
 * component sin arrastrar `'use client'`.
 */
export default function AccionesContacto({ telefono, email, ilegible, quien, tam = 'sm' }: {
  telefono?: string | null
  email?: string | null
  /** El contacto cifrado que asegura no pudo descifrar: no se ofrece nada. */
  ilegible?: boolean
  /** Para el `aria-label`: «Llamar a Jose Suárez». Sin esto son tres iconos mudos. */
  quien: string
  tam?: 'sm' | 'md'
}) {
  const a = accionesContacto({ telefono, email, ilegible })
  if (!a.tel && !a.email) return null

  const estilo = { ...btnIcono('sutil', tam), textDecoration: 'none' }
  const px = tam === 'sm' ? 14 : 16

  return (
    // `alignSelf` para cuando cuelga de una fila flex con `alignItems:'baseline'`
    // (la cabecera de una ficha de retención): un botón de 34px no tiene línea
    // base y se descolgaría del nombre.
    <span style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle', alignSelf: 'center' }}>
      {a.tel && (
        <a href={a.tel} style={estilo} aria-label={`Llamar a ${quien}`} title={`Llamar a ${quien}`}>
          <Phone size={px} strokeWidth={1.75} aria-hidden />
        </a>
      )}
      {a.whatsapp && (
        <a
          href={a.whatsapp}
          target="_blank"
          rel="noreferrer"
          style={estilo}
          aria-label={`WhatsApp a ${quien}`}
          title={a.nota ? `WhatsApp a ${quien} — ${a.nota}` : `WhatsApp a ${quien}`}
        >
          <MessageCircle size={px} strokeWidth={1.75} aria-hidden />
        </a>
      )}
      {a.email && (
        <a href={a.email} style={estilo} aria-label={`Escribir a ${quien}`} title={`Escribir a ${quien}`}>
          <Mail size={px} strokeWidth={1.75} aria-hidden />
        </a>
      )}
    </span>
  )
}
