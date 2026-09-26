// Botón flotante de WhatsApp — el mismo patrón que `apps/asegura-web`
// (`components/Whatsapp.tsx`), aquí para el cliente ya identificado.
//
// El número NO se escribe aquí: sale de `MEDIADOR`, la fuente única del
// mediador en todo el monorepo (el mismo que usa la web pública), y el
// enlace lo compone `whatsappUrl()`.
//
// 🚨 Esto NO es el canal de login por WhatsApp (`lib/canal.ts`), que sigue
// sin registrar porque no hay WABA. Un enlace `wa.me` de "clic para
// chatear" no necesita WhatsApp Business API: solo necesita un número que
// alguien conteste, y ese número ya existe (lo usa `asegura-web`).
//
// 📌 Servidor, no cliente: es un `<a>`. Un botón flotante no necesita React.
import { MEDIADOR, whatsappUrl } from '@central/module-seguros'

import { WHATSAPP_PATH } from './whatsapp-icono'

/** Mensaje para quien YA es (o dice ser) cliente, distinto del de la web
 *  pública (que es para un lead nuevo). */
export const SALUDO_CLIENTE = `Hola ${MEDIADOR.marca}, soy cliente y quiero consultaros algo.`

export function WhatsappFlotante() {
  return (
    <a
      className="wsp-flotante"
      href={whatsappUrl(SALUDO_CLIENTE)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Escribir por WhatsApp a ${MEDIADOR.marca}`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={WHATSAPP_PATH} />
      </svg>
    </a>
  )
}
