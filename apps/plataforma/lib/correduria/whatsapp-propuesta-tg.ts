// Propuestas de la IA de WhatsApp de Grupo ASegura (spec 2026-11-04 §5, parte B): la parte de PLATAFORMA del botón
// ✅ Aplicar / ❌ Descartar (`wap_ok:<uuid>` / `wap_no:<uuid>`).
// asegura (`lib/whatsapp/propuestas.ts`) manda a Alberto el aviso con esos botones y guarda `telegram_message_id`. El
// webhook de Telegram los recibe y, SOLO si pulsa la persona autorizada (from.id = TELEGRAM_CHAT_ID), reenvía la decisión
// a `POST /api/operador/whatsapp/propuesta` con `x-actor: humano:<cuentaId>` del titular. asegura hace el resto: un solo
// uso (409), caducidad de 7 días (410), y aplicar nunca envía nada al cliente ni cierra una devolución.
//
// 🚨 Cepo: sin un actor `humano:<uuid>` NO se llama a asegura (aplicar escribe en la cartera: siempre una persona).
// El formato del callback es el de `apps/asegura/lib/whatsapp/propuestas-reglas.ts` (`leerCallbackPropuesta`): se
// duplica aquí porque plataforma no importa código de asegura; el test fija los dos ejemplos de allí.
import { cabecerasPuerto } from '../puerto-actor.ts'

export const PREFIJO_WAP = 'wap'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTOR_HUMANO = /^humano:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionWap = 'aplicar' | 'descartar'
export type BotonWap = { ok: true; id: string; decision: DecisionWap } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO; sin chat configurado, nadie) y un `ok|no` con un uuid. PURO. */
export function decidirBotonWap(
  cb: { from?: { id?: unknown } | null } | null | undefined,
  accion: string,
  args: readonly string[],
  chatAutorizado: string | undefined,
): BotonWap {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if ((accion !== 'ok' && accion !== 'no') || args.length !== 1 || !UUID.test(args[0])) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, id: args[0].toLowerCase(), decision: accion === 'ok' ? 'aplicar' : 'descartar' }
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
  d: { id: string; decision: DecisionWap; actor: string | null },
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
      body: JSON.stringify({ id: d.id, decision: d.decision }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await res.json().catch(() => null)) as { estado?: unknown } | null
    return { status: res.status, estado: typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}` }
  } catch {
    return { status: 502, estado: 'red' }
  }
}

/** Línea que sustituye a los botones tras pulsar. PURO. */
export function lineaTrasPulsarWap(decision: DecisionWap, r: ResultadoWap): string {
  if (r.status === 200 && r.estado === 'aplicada') return '✅ <i>Aplicada en el CRM.</i>'
  if (r.status === 200 && r.estado === 'descartada') return '❌ <i>Descartada: no se toca nada.</i>'
  if (r.status === 409) return '<i>Ya estaba resuelta: no se hace nada más.</i>'
  if (r.status === 410) return '⌛ <i>Caducada (más de 7 días): no se aplica. Míralo en la ficha.</i>'
  if (r.status === 404) return '<i>La propuesta ya no existe: no se hace nada.</i>'
  if (r.estado === 'sin_actor') return '⚠️ <i>No se sabe qué cuenta es la tuya (FACTURAS_CUENTA_ID / GMAIL_USER): no se aplica nada.</i>'
  if (r.status === 503) return '⚠️ <i>asegura no está lista (sin configurar o sin migración): sigue pendiente.</i>'
  return `⚠️ <i>No se ha podido ${decision === 'aplicar' ? 'aplicar' : 'descartar'} (${r.estado}). Sigue pendiente: mira la ficha antes de repetir.</i>`
}
