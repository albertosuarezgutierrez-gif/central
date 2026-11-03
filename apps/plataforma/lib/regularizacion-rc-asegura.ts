// Regularización de RC (03/11/2026): la parte de PLATAFORMA del ✅ Enviar / ✏️ Modificar / ❌ Descartar.
// asegura (`lib/regularizacion-rc.ts`) manda a Alberto el borrador del correo al cliente con botones `rrc_<acción>:<id>:<v>`.
// El webhook de Telegram los recibe y, SOLO si pulsa la persona autorizada (from.id = TELEGRAM_CHAT_ID):
//   · env/no → reenvía la decisión a asegura (`POST /api/operador/regularizacion-rc` accion `decidir`), que reclama la fila
//     antes de mandar (doble clic = un correo) y comprueba la versión (un ✅ de un mensaje viejo no envía).
//   · mod    → pide el texto nuevo con force_reply (marca «[rrc <uuid>]»); la respuesta va a asegura (accion `editar`),
//     que sube la versión y vuelve a proponer con botones nuevos.
// Sale a un TERCERO (el cliente): nada se envía sin ese ✅.
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_RRC = 'rrc'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionBotonRrc = { ok: true; accion: 'env' | 'mod' | 'no'; id: string; version: number } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURO. */
export function decidirBotonRrc(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonRrc {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if ((accion !== 'env' && accion !== 'mod' && accion !== 'no') || args.length !== 2) return { ok: false, toast: 'Botón no válido' }
  const [id, v] = args
  if (!UUID.test(id) || !/^\d{1,4}$/.test(v) || Number(v) < 1) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, accion, id, version: Number(v) }
}

/** El mensaje que pide el texto nuevo (force_reply). La marca liga la respuesta a la solicitud. PURO. */
export function textoPedirEdicionRrc(id: string): string {
  return `✏️ Escribe el correo NUEVO para el cliente, respondiendo a este mensaje. Pon {{ENLACE}} donde quieras el enlace (si no, va al final). [rrc ${id}]`
}

/** Id de la solicitud si el mensaje citado es nuestra petición de edición. PURO. */
export function idDeEdicionRrc(citado: string | null | undefined): string | null {
  const m = /\[rrc ([0-9a-f-]{36})\]/i.exec(citado ?? '')
  return m && UUID.test(m[1]) ? m[1] : null
}

/**
 * Línea que sustituye a los botones tras pulsar. PURO. Misma tabla que `lineaTrasPulsarRrc` de asegura
 * (`apps/asegura/lib/regularizacion-rc-telegram.ts`); el test compara que no afirme un envío que no consta.
 */
export function lineaTrasPulsarRrc(estado: string): string {
  switch (estado) {
    case 'enviada': return '✅ <i>Correo enviado al cliente con su enlace (30 días). Te aviso cuando conteste.</i>'
    case 'descartada': return '❌ <i>Descartada: no sale nada.</i>'
    case 'editando': return '✏️ <i>Contesta al mensaje siguiente con el texto nuevo: volverá con sus botones.</i>'
    case 'obsoleta': return '♻️ <i>Este borrador ya no es el vigente (lo has modificado): usa el ÚLTIMO mensaje.</i>'
    case 'sin_cambios': return '<i>Ya estaba decidida: no se hace nada más.</i>'
    case 'sin_destino': return '⚠️ <i>No tiene email válido en la ficha (o está de baja): no se ha enviado. Sigue en borrador.</i>'
    case 'canal_no_disponible': return '⚠️ <i>Sin proveedor de correo en asegura: NO ha salido. Sigue en borrador; pulsa ✅ cuando esté arreglado.</i>'
    case 'envio_fallido': return '⚠️ <i>El envío falló (o no consta que saliera): mira «Enviados» antes de repetir. Sigue en borrador.</i>'
    case 'sin_migracion': return '🔧 <i>Falta aplicar el SQL de la regularización: no se ha hecho nada.</i>'
    default: return `⚠️ <i>No sé si se ha hecho (${estado.replace(/[<>&]/g, '').slice(0, 60)}). Mira la ficha antes de repetir.</i>`
  }
}

async function puerto(cuerpo: Record<string, unknown>, actor: string): Promise<string> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return 'puerto_sin_configurar'
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}/api/operador/regularizacion-rc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secret, actor)) },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await res.json().catch(() => null)) as { estado?: unknown } | null
    return typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 80) : 'error'
  }
}

/** ✅/❌ → asegura. Nunca lanza: devuelve el `estado` para pintar la línea. */
export function decidirRrcEnAsegura(d: { accion: 'env' | 'no'; id: string; version: number }): Promise<string> {
  return puerto({ accion: 'decidir', decision: d.accion, id: d.id, version: d.version }, 'sistema:telegram-regularizacion')
}

/** Texto editado por Alberto → asegura (sube la versión y vuelve a proponer). Nunca lanza. */
export function editarRrcEnAsegura(id: string, texto: string): Promise<string> {
  return puerto({ accion: 'editar', id, texto }, 'sistema:telegram-regularizacion')
}
