import { Phone, Mail } from 'lucide-react'
import { btnIcono } from '@/components/ui'
import { accionesContacto } from '@/lib/acciones-contacto'
import BotonWhatsapp from './BotonWhatsapp'

/**
 * Llamar · WhatsApp · escribir, al lado del nombre de un cliente.
 *
 * Petición de Alberto (04/09/2026): «al lado de cada nombre cliente aparezca
 * icono tlf para poder llamarlo, mail y whassap». La norma es que aparezcan
 * SIEMPRE que haya con qué — no que aparezcan siempre: sin teléfono no se pinta
 * un icono apagado, se dice en texto por qué no lo hay (y «cifrado» y «no
 * consta» se arreglan en sitios distintos).
 *
 * 🚨 El WhatsApp lo decide `BotonWhatsapp` (que se apoya en `urlWhatsapp`), no
 * este componente: un icono de WhatsApp sobre un 954… es una acción que falla,
 * y sobre todo, dos criterios distintos de «esto admite WhatsApp» en la misma
 * app harían que el icono saliera en una pantalla y no en otra para el MISMO
 * número.
 *
 * Server-safe: son enlaces, no handlers. Se puede montar desde un server
 * component sin arrastrar `'use client'`.
 */
export default function AccionesContacto({ telefono, email, ilegible, quien, tam = 'sm' }: {
  telefono?: string | null
  email?: string | null
  /** El contacto cifrado que asegura no pudo descifrar: no se ofrece nada. */
  ilegible?: boolean
  /** Para el `aria-label`: «Llamar a Jose Suárez». Sin esto son iconos mudos. */
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
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center', verticalAlign: 'middle', alignSelf: 'center' }}>
      {a.tel && (
        <a href={a.tel} style={estilo} aria-label={`Llamar a ${quien}`} title={a.nota ? `Llamar a ${quien} — ${a.nota}` : `Llamar a ${quien}`}>
          <Phone size={px} strokeWidth={1.75} aria-hidden />
        </a>
      )}
      {telefono && !ilegible && <BotonWhatsapp telefono={telefono} compacto />}
      {a.email && (
        <a href={a.email} style={estilo} aria-label={`Escribir a ${quien}`} title={`Escribir a ${quien}`}>
          <Mail size={px} strokeWidth={1.75} aria-hidden />
        </a>
      )}
    </span>
  )
}
