// Regularización de RC (03/11/2026): la parte de PLATAFORMA del ✅ Enviar / ✏️ Modificar / ❌ Descartar.
// asegura (`lib/regularizacion-rc.ts`) manda a Alberto el borrador del correo al cliente con botones `rrc_<acción>:<id>:<v>`.
// El webhook de Telegram los recibe y, SOLO si pulsa la persona autorizada (from.id = TELEGRAM_CHAT_ID):
//   · env/no → reenvía la decisión a asegura (`POST /api/operador/regularizacion-rc` accion `decidir`), que reclama la fila
//     antes de mandar (doble clic = un correo) y comprueba la versión (un ✅ de un mensaje viejo no envía).
//   · mod    → pide el texto nuevo con force_reply (marca «[rrc <uuid>]»); la respuesta va a asegura (accion `editar`),
//     que sube la versión y vuelve a proponer con botones nuevos.
// Sale a un TERCERO (el cliente): nada se envía sin ese ✅.
// FASE 3 (03/11/2026), respuesta a la COMPAÑÍA, mismo patrón y misma comprobación del titular:
//   · cenv → `decidir_compania` (✅ Enviar a la compañía; versión = `compania_version`, anti-replay en asegura).
//   · cmod → force_reply con la marca «[rrcc <uuid>]»; la respuesta («Para: correo» y/o texto) va a `editar_compania`.
//   · res  → `resolver` (🏁 Regularización resuelta: cierra solicitud y tarea; no envía nada).
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_RRC = 'rrc'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type AccionBotonRrc = 'env' | 'mod' | 'no' | 'cenv' | 'cmod' | 'res'
const ACCIONES: readonly AccionBotonRrc[] = ['env', 'mod', 'no', 'cenv', 'cmod', 'res']
export type DecisionBotonRrc = { ok: true; accion: AccionBotonRrc; id: string; version: number } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURO. */
export function decidirBotonRrc(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonRrc {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (!(ACCIONES as readonly string[]).includes(accion) || args.length !== 2) return { ok: false, toast: 'Botón no válido' }
  const [id, v] = args
  if (!UUID.test(id) || !/^\d{1,4}$/.test(v) || Number(v) < 1) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, accion: accion as AccionBotonRrc, id, version: Number(v) }
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

/** ✏️ de la respuesta a la COMPAÑÍA (marca distinta: la respuesta va a `editar_compania`, no al correo del cliente). PURO. */
export function textoPedirEdicionRrcCompania(id: string): string {
  return `✏️ Escribe el correo NUEVO para la compañía respondiendo a este mensaje. Para elegir el buzón, pon en la PRIMERA línea «Para: correo» (solo vale un contacto ACTIVO de esa compañía en el Directorio); si solo cambias el buzón, basta esa línea. [rrcc ${id}]`
}

/** Id de la solicitud si el mensaje citado es la petición de edición de la respuesta a la compañía. PURO. */
export function idDeEdicionRrcCompania(citado: string | null | undefined): string | null {
  const m = /\[rrcc ([0-9a-f-]{36})\]/i.exec(citado ?? '')
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
    // Fase 3 (compañía)
    case 'enviada_compania': return '✅ <i>Respuesta enviada a la compañía. Cuando emita el suplemento, pulsa 🏁 (o usa la ficha).</i>'
    case 'sin_destino_compania': return '⚠️ <i>Falta dirección de la compañía (o el buzón ya no está activo en el Directorio): NO ha salido. Pulsa ✏️ y pon «Para: correo».</i>'
    case 'adjunto_ilegible': return '⚠️ <i>No he podido leer el documento del cliente: NO ha salido (el texto dice que va adjunto). Míralo en su ficha.</i>'
    case 'ilegible': return '⚠️ <i>No he podido descifrar el borrador (clave PII): NO ha salido.</i>'
    case 'resuelta': return '🏁 <i>Regularización resuelta: solicitud cerrada y tarea del correo cerrada.</i>'
    case 'ya_resuelta': return '🏁 <i>Ya estaba resuelta: no se hace nada más.</i>'
    case 'no_completada': return '⚠️ <i>El cliente aún no ha dado la cifra: no se puede dar por resuelta.</i>'
    case 'enviando': return '⏳ <i>Hay un envío a la compañía en curso: espera a que acabe y vuelve a pulsar.</i>'
    default: return `⚠️ <i>No sé si se ha hecho (${estado.replace(/[<>&]/g, '').slice(0, 60)}). Mira la ficha antes de repetir.</i>`
  }
}

/**
 * Línea del aviso en la APP del portal tras «Correo enviado» (03/11/2026). PURO. El push es accesorio: solo se pinta con
 * `enviada`, y lo que no consta se dice («no consta»), nunca «enviado».
 */
export function lineaPushRrc(estado: string, push: unknown): string | null {
  if (estado !== 'enviada') return null
  const p = push && typeof push === 'object' ? (push as Record<string, unknown>) : null
  switch (p?.estado) {
    case 'enviado': {
      const n = typeof p.dispositivos === 'number' && Number.isInteger(p.dispositivos) && p.dispositivos > 0 ? p.dispositivos : null
      return n === null ? '📱 <i>Aviso en la app: no consta a cuántos dispositivos.</i>' : `📱 <i>Aviso en la app: enviado a ${n} dispositivo${n === 1 ? '' : 's'}.</i>`
    }
    case 'sin_app': return '📱 <i>El cliente no tiene la app activada: solo ha ido el correo.</i>'
    case 'preferencia': return '📱 <i>El cliente ha pedido no recibir avisos en la app ahora (solo correo / no molestar): solo ha ido el correo.</i>'
    case 'no_se_pudo': return '📱 <i>Aviso en la app: no se pudo (el correo sí ha salido).</i>'
    default: return '📱 <i>Aviso en la app: no consta (el correo sí ha salido).</i>'
  }
}

async function puerto(cuerpo: Record<string, unknown>, actor: string): Promise<string> {
  return (await puertoConDetalle(cuerpo, actor)).estado
}

async function puertoConDetalle(cuerpo: Record<string, unknown>, actor: string): Promise<{ estado: string; push: unknown }> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'puerto_sin_configurar', push: null }
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}/api/operador/regularizacion-rc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secret, actor)) },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await res.json().catch(() => null)) as { estado?: unknown; push?: unknown } | null
    return { estado: typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}`, push: j?.push ?? null }
  } catch (e) {
    return { estado: e instanceof Error ? e.message.slice(0, 80) : 'error', push: null }
  }
}

/** ✅/❌ → asegura. Nunca lanza: devuelve el `estado` (y el `push` de la app) para pintar las líneas. */
export function decidirRrcEnAsegura(d: { accion: 'env' | 'no'; id: string; version: number }): Promise<{ estado: string; push: unknown }> {
  return puertoConDetalle({ accion: 'decidir', decision: d.accion, id: d.id, version: d.version }, 'sistema:telegram-regularizacion')
}

/** ✅ a la compañía / 🏁 resuelta → asegura. Nunca lanza: devuelve el `estado` para pintar la línea. */
export function decidirRrcCompaniaEnAsegura(d: { accion: 'cenv' | 'res'; id: string; version: number }): Promise<string> {
  return d.accion === 'cenv'
    ? puerto({ accion: 'decidir_compania', id: d.id, version: d.version }, 'sistema:telegram-regularizacion')
    : puerto({ accion: 'resolver', id: d.id, actor: 'telegram:alberto' }, 'sistema:telegram-regularizacion')
}

/** «Para:»/texto nuevo de la respuesta a la compañía → asegura (sube `compania_version` y vuelve a proponer). Nunca lanza. */
export function editarRrcCompaniaEnAsegura(id: string, texto: string): Promise<string> {
  return puerto({ accion: 'editar_compania', id, texto }, 'sistema:telegram-regularizacion')
}

/** Texto editado por Alberto → asegura (sube la versión y vuelve a proponer). Nunca lanza. */
export function editarRrcEnAsegura(id: string, texto: string): Promise<string> {
  return puerto({ accion: 'editar', id, texto }, 'sistema:telegram-regularizacion')
}
