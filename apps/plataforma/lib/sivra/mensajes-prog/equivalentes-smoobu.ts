// lib/sivra/mensajes-prog/equivalentes-smoobu.ts — ¿Smoobu ya mandó su plantilla equivalente? PURO.
//
// Pedido por Alberto (31/08/2026): antes de enviar un hito, revisar el hilo de la reserva y, si la
// plantilla automática de Smoobu equivalente ya está ahí, NO duplicar. Protege la transición piso a
// piso: al activar los mensajes nuestros, las plantillas de Smoobu pueden seguir encendidas unos
// días — el hito se marca hecho, no se envía, y se avisa a Telegram de qué plantilla hay que apagar.
//
// Los patrones salen del inventario REAL de los hilos (31/08/2026): asuntos literales de las
// plantillas de Smoobu. Se comparan contra asunto+texto de los mensajes del HOST del hilo.

import type { TipoMensaje } from './plantillas.ts'

const EQUIVALENTES: Partial<Record<TipoMensaje, RegExp>> = {
  confirmacion: /booking confirmation/i,
  acceso: /WHERE TO COLLECT THE KEYS/i,
  vispera_llegada: /RECORDATORIO\s*-\s*MUY IMPORTANTE/i,
  bienvenida: /BIENVENIDO/i,
  estancia: /podamos hacer para que su estancia|make your stay better|mejorar su estad/i,
  post_salida: /Ayúdanos a mejorar|Help us to improve/i,
  // vispera_salida: Smoobu NO tiene plantilla de salida (se mandaba a mano) → nunca hay equivalente.
}

export type MsgHilo = { from: 'guest' | 'host'; subject: string; text: string }

export function yaLoMandoSmoobu(tipo: TipoMensaje, msgs: MsgHilo[]): boolean {
  const re = EQUIVALENTES[tipo]
  if (!re) return false
  return (msgs || []).some(m => m.from === 'host' && (re.test(m.subject || '') || re.test(m.text || '')))
}
