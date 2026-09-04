'use client'
import { MessageCircle } from 'lucide-react'
import { urlWhatsapp } from '@/lib/telefono-wa'

/** Verde de marca de WhatsApp. No es un estado de la app, así que no es un token. */
const VERDE_WHATSAPP = '#25D366'

/**
 * Abre WhatsApp con el cliente, al lado de su teléfono (Alberto, 03/09/2026:
 * «se podría poner al lado de los móviles un icono de WhatsApp y me ir al
 * WhatsApp del cliente pulsándolo»).
 *
 * 🚨 Si `urlWhatsapp()` no puede afirmar que el número es un móvil, este
 * componente devuelve **`null` y no pinta nada**. Ni un enlace (WhatsApp abre
 * igual con un fijo y el «este número no está en WhatsApp» solo se ve DESPUÉS
 * de pulsar) ni un icono apagado (un icono que se ve promete una acción). El
 * teléfono se queda con su `tel:`, que es lo que sí se sabe que funciona.
 */
export default function BotonWhatsapp({ telefono, compacto = false }: {
  telefono: string
  /**
   * Para cuando va incrustado en una línea de texto densa (la cabecera de la
   * ficha, la lista de personas): 32px en vez de 44 para no partir el renglón.
   * En una fila de lista —donde es una acción por derecho propio— se deja el
   * área táctil completa de 44px.
   */
  compacto?: boolean
}) {
  const url = urlWhatsapp(telefono)
  if (url === null) return null
  const lado = compacto ? 32 : 44
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir WhatsApp con ${telefono}`}
      title={`Abrir WhatsApp con ${telefono} (se abre en una pestaña nueva)`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: lado, height: lado, minWidth: lado,
        padding: 0, borderRadius: 8, flex: '0 0 auto',
        color: VERDE_WHATSAPP, textDecoration: 'none', verticalAlign: 'middle',
      }}
    >
      <MessageCircle size={compacto ? 16 : 18} strokeWidth={2} aria-hidden />
    </a>
  )
}
