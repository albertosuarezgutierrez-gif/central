// SOLICITUD DE DATOS DE LA RENOVACIÓN por la app (05/11/2026): la parte de PLATAFORMA.
//
//   · «Pedir datos al cliente por la app» en `/correduria/poliza/[id]` → `POST /api/operador/solicitud-renovacion/preparar`
//     (asegura): pregunta SOLO lo que el bot de hogar echa en falta, deja la solicitud SIN publicar y manda a Alberto el
//     Telegram con ✅ Enviar / ✏️ Modificar.
//   · ✅ (`cdr_env:<solicitudId>`, webhook de Telegram) o «Enviar al cliente por la app» (pantalla) →
//     `POST /api/operador/solicitud-renovacion/publicar`. SOLO la persona autorizada (from.id = TELEGRAM_CHAT_ID), sin reintentar.
//
// 🚨 Sale a un TERCERO (el cliente): nada se publica sin ese botón. 503 `canal_no_disponible` (nadie que pueda contestar usa la
// app) ≠ «el envío falló». Las funciones PURAS viven en asegura (`solicitud-renovacion-reglas.ts`): aquí se replican SOLO el
// prefijo y la decisión del botón, con un test que las fija iguales (plataforma no importa asegura).
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_CDR = 'cdr'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionBotonCdr = { ok: true; solicitudId: string } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURO. */
export function decidirBotonCdr(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonCdr {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (accion !== 'env' || args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, solicitudId: args[0].toLowerCase() }
}

/** ¿Vale el «🔁 Reintentar bots» (`cdr_bot:<id>`)? Misma puerta del titular. PURO. */
export function decidirBotonBotsCdr(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonCdr {
  if (accion !== 'bot') return { ok: false, toast: 'Botón no válido' }
  return decidirBotonCdr(cb, 'env', args, chatAutorizado)
}

/** Línea que sustituye a los botones tras pulsar ✅. PURO. */
export function lineaTrasEnviarCdr(estado: string): string {
  switch (estado) {
    case 'publicada': return '✅ <i>Enviada a su app: le llega a la campana («necesitamos unos datos») y un correo de aviso, sin datos.</i>'
    case 'ya_publicada': return '<i>Ya estaba enviada: no se hace nada más.</i>'
    case 'no_vigente': return '⌛ <i>Este mensaje no es el último de esta solicitud (se rehízo): usa el más reciente.</i>'
    case 'canal_no_disponible': return '⛔ <i>Nadie que pueda contestar usa la app: no se ha enviado.</i>'
    case 'caducada': return '⌛ <i>La solicitud caducó o se anuló: prepárala de nuevo desde la póliza.</i>'
    case 'contestada': return '<i>Ya está contestada.</i>'
    case 'sin_migracion': return '🔒 <i>Falta aplicar la migración 2026-11-05d: no se ha enviado nada.</i>'
    case 'no_encontrado': return '⚠️ <i>No encuentro esa solicitud.</i>'
    case 'puerto_sin_configurar': return '⚠️ <i>Falta ASEGURA_OPERADOR_SECRET en plataforma: no se ha enviado.</i>'
    default: return '⚠️ <i>No sé si se ha enviado (fallo del puerto). Mira la póliza antes de repetir.</i>'
  }
}

type Reenvio = { status: number; json: unknown }

async function llamar(path: string, body: Record<string, unknown>, actor?: string, timeoutMs = 55_000): Promise<Reenvio> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'puerto_sin_configurar' } }
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await cabecerasPuerto(secret, actor)) },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}

/** Prepara la solicitud (gratis; no sale nada). `actor` = el email de la sesión; lo pone el servidor. */
export function prepararSolicitudRenovacionAsegura(e: { polizaId: string; actor: string }): Promise<Reenvio> {
  return llamar('/api/operador/solicitud-renovacion/preparar', { polizaId: e.polizaId, actor: e.actor })
}

/** El ✅. `via: 'telegram'`: asegura EXIGE `telegramMessageId` y que sea el último mensaje de revisión (si no, 409). */
export function publicarSolicitudRenovacionAsegura(e: { solicitudId: string; actor: string; via: 'telegram' | 'pantalla'; telegramMessageId?: number | null }, actorPuerto?: string): Promise<Reenvio> {
  return llamar('/api/operador/solicitud-renovacion/publicar', {
    solicitudId: e.solicitudId, actor: e.actor, via: e.via,
    ...(typeof e.telegramMessageId === 'number' ? { telegramMessageId: e.telegramMessageId } : {}),
  }, actorPuerto, 25_000)
}

/** El `estado` de la respuesta (para la línea de Telegram). Nunca lanza. */
export function estadoDeCdr(r: Reenvio): string {
  const j = r.json as { estado?: unknown } | null
  return typeof j?.estado === 'string' ? j.estado : `http_${r.status}`
}

/**
 * «🔁 Reintentar bots» (07/11/2026): vuelve a encolar los bots de hogar de una renovación YA contestada. Solo precio (gratis):
 * ni Avant2 ni emisión ni nada al cliente. asegura manda su propio Telegram con el resultado.
 */
export function reintentarBotsRenovacionAsegura(solicitudId: string, actorPuerto?: string): Promise<Reenvio> {
  return llamar('/api/operador/solicitud-renovacion/reintentar-bots', { solicitudId }, actorPuerto, 55_000)
}
