// Propuestas de la IA de WhatsApp de Grupo ASegura (spec 2026-11-04 §5, parte B): la parte de PLATAFORMA del botón
// ✅ Aplicar / ❌ Descartar (`wap_ok:<uuid>` / `wap_no:<uuid>`).
// asegura (`lib/whatsapp/propuestas.ts`) manda a Alberto el aviso con esos botones y guarda `telegram_message_id`. El
// webhook de Telegram los recibe y, SOLO si pulsa la persona autorizada (from.id = TELEGRAM_CHAT_ID), reenvía la decisión
// a `POST /api/operador/whatsapp/propuesta` con `x-actor: humano:<cuentaId>` del titular. asegura hace el resto: un solo
// uso (409), caducidad de 7 días (410), y aplicar nunca envía nada al cliente ni cierra una devolución.
//
// Aprendizaje (spec § «Aprendizaje y autonomía»): ✏️ Modificar (`wap_ed:<uuid>`) pide la corrección con force_reply
// (marca «[wap <uuid>]»; la respuesta va como `modificar`) y ↩️ Deshacer (`wap_un:<uuid>`) revierte una aplicada SOLA.
//
// 🚨 Cepo: sin un actor `humano:<uuid>` NO se llama a asegura (aplicar escribe en la cartera: siempre una persona).
// El formato del callback es el de `apps/asegura/lib/whatsapp/propuestas-reglas.ts` (`leerCallbackPropuesta`): se
// duplica aquí porque plataforma no importa código de asegura; el test fija los dos ejemplos de allí.
import { cabecerasPuerto } from '../puerto-actor.ts'

export const PREFIJO_WAP = 'wap'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTOR_HUMANO = /^humano:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionWap = 'aplicar' | 'descartar' | 'modificar' | 'deshacer'
/** Las acciones `wap_<acción>` que acepta el webhook: las MISMAS que emite asegura (`ACCIONES_WAP`; lo fija el test). */
export const ACCIONES_WAP = ['ok', 'no', 'ed', 'un'] as const
const DECISION: Record<(typeof ACCIONES_WAP)[number], DecisionWap> = { ok: 'aplicar', no: 'descartar', ed: 'modificar', un: 'deshacer' }
export type BotonWap = { ok: true; id: string; decision: DecisionWap } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO; sin chat configurado, nadie) y una acción de `ACCIONES_WAP` con un uuid. PURO. */
export function decidirBotonWap(
  cb: { from?: { id?: unknown } | null } | null | undefined,
  accion: string,
  args: readonly string[],
  chatAutorizado: string | undefined,
): BotonWap {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (!(ACCIONES_WAP as readonly string[]).includes(accion) || args.length !== 1 || !UUID.test(args[0])) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, id: args[0].toLowerCase(), decision: DECISION[accion as (typeof ACCIONES_WAP)[number]] }
}

/**
 * El mensaje que pide la corrección (force_reply). La marca liga la respuesta a la propuesta y, si se conoce, al mensaje
 * ORIGINAL con botones (`[wap <uuid> m<id>]`) para poder quitárselos al resolver. PURO.
 */
export function textoPedirCorreccionWap(id: string, mensajeOriginalId?: number | null): string {
  const m = Number.isInteger(mensajeOriginalId) && (mensajeOriginalId as number) > 0 ? ` m${mensajeOriginalId}` : ''
  return `✏️ Responde a este mensaje con la corrección: una fecha (dd/mm/aaaa) y/o una observación. Se aplicará la versión corregida y quedará anotada para que la IA aprenda. [wap ${id}${m}]`
}

/** Id de la propuesta si el mensaje citado es nuestra petición de corrección. PURO. */
export function idDeCorreccionWap(citado: string | null | undefined): string | null {
  const m = /\[wap ([0-9a-f-]{36})(?: m\d+)?\]/i.exec(citado ?? '')
  return m && UUID.test(m[1]) ? m[1].toLowerCase() : null
}

/** Id del mensaje original (el de los botones) que lleva la marca de la petición de corrección, o `null`. PURO. */
export function mensajeOriginalDeCorreccionWap(citado: string | null | undefined): number | null {
  const m = /\[wap [0-9a-f-]{36} m(\d+)\]/i.exec(citado ?? '')
  const n = m ? Number(m[1]) : NaN
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * ¿Quedó la propuesta resuelta (o ya imposible de resolver) y por tanto el mensaje original NO debe conservar sus botones?
 * Una corrección inválida o un fallo de red/asegura dejan la propuesta pendiente: ahí los botones se quedan. PURO.
 */
export function resueltaParaQuitarBotones(r: ResultadoWap): boolean {
  if (r.status === 200) return true
  return r.status === 404 || r.status === 409 || r.status === 410
}

/** `humano:<cuentaId>` del titular, o `null` si la cuenta no es un uuid (entonces no se aplica nada). PURO. */
export function actorTitular(cuentaId: string | null | undefined): string | null {
  const id = (cuentaId ?? '').trim()
  return UUID.test(id) ? `humano:${id.toLowerCase()}` : null
}

export type ResultadoWap = { status: number; estado: string }

/**
 * Reenvía la decisión a asegura. Nunca lanza. Sin actor humano válido NO llama (devuelve `sin_actor`): es el cepo de
 * «el handler no aplica sin x-actor humano». `fetchImpl` se inyecta en los tests.
 */
export async function resolverPropuestaEnAsegura(
  d: { id: string; decision: Exclude<DecisionWap, 'modificar'>; actor: string | null } | { id: string; decision: 'modificar'; correccion: string; actor: string | null },
  entorno: { secret?: string; base?: string } = { secret: process.env.ASEGURA_OPERADOR_SECRET, base: process.env.ASEGURA_URL },
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoWap> {
  if (!d.actor || !ACTOR_HUMANO.test(d.actor)) return { status: 0, estado: 'sin_actor' }
  if (!entorno.secret) return { status: 503, estado: 'puerto_sin_configurar' }
  const base = (entorno.base || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetchImpl(`${base}/api/operador/whatsapp/propuesta`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await cabecerasPuerto(entorno.secret, d.actor)) },
      body: JSON.stringify(d.decision === 'modificar' ? { id: d.id, decision: d.decision, correccion: d.correccion.slice(0, 500) } : { id: d.id, decision: d.decision }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await res.json().catch(() => null)) as { estado?: unknown } | null
    return { status: res.status, estado: typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}` }
  } catch {
    return { status: 502, estado: 'red' }
  }
}

/** Línea que sustituye a los botones tras pulsar (o responde a la corrección). PURO. */
export function lineaTrasPulsarWap(decision: DecisionWap, r: ResultadoWap): string {
  if (r.status === 200 && r.estado === 'aplicada') return '✅ <i>Aplicada en el CRM.</i>'
  if (r.status === 200 && r.estado === 'descartada') return '❌ <i>Descartada: no se toca nada.</i>'
  if (r.status === 200 && r.estado === 'modificada') return '✏️ <i>Aplicada con tu corrección y anotada para que la IA aprenda.</i>'
  if (r.status === 200 && r.estado === 'deshecha') return '↩️ <i>Deshecha: vuelve al valor anterior. Este tipo vuelve a pedirte permiso.</i>'
  if (r.estado === 'correccion_invalida') return '⚠️ <i>No entiendo la corrección (una fecha dd/mm/aaaa y/o una observación): no he cambiado nada. Pulsa ✏️ otra vez.</i>'
  if (r.estado === 'cambiado_despues') return '⚠️ <i>No se deshace: el dato se cambió después (lo que puso una persona no se pisa). Míralo en la ficha.</i>'
  if (r.estado === 'ya_deshecha') return '<i>Ya estaba deshecha: no se hace nada más.</i>'
  if (r.estado === 'no_autonoma' || r.estado === 'sin_previo') return '<i>Solo se deshace una propuesta aplicada sola: no se hace nada.</i>'
  if (r.status === 409) return '<i>Ya estaba resuelta: no se hace nada más.</i>'
  if (r.status === 410) return '⌛ <i>Caducada (más de 7 días): no se aplica. Míralo en la ficha.</i>'
  if (r.status === 404) return '<i>La propuesta ya no existe: no se hace nada.</i>'
  if (r.estado === 'sin_actor') return '⚠️ <i>No se sabe qué cuenta es la tuya (FACTURAS_CUENTA_ID / GMAIL_USER): no se aplica nada.</i>'
  if (r.status === 503) return '⚠️ <i>asegura no está lista (sin configurar o sin migración): sigue pendiente.</i>'
  const estado = r.estado.replace(/[<>&]/g, '').slice(0, 60)
  if (decision === 'deshacer') return `⚠️ <i>No se ha podido deshacer (${estado}): sigue aplicada. Mira la ficha antes de repetir.</i>`
  return `⚠️ <i>No se ha podido ${decision === 'descartar' ? 'descartar' : 'aplicar'} (${estado}). Sigue pendiente: mira la ficha antes de repetir.</i>`
}
