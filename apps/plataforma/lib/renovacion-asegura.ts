// RENOVACIÓN CON ALTERNATIVAS (04/11/2026): la parte de PLATAFORMA.
//
//   · «Preparar renovación con alternativas» en `/correduria/poliza/[id]` → `POST /api/operador/renovacion/preparar` (asegura):
//     borrador `modo = 'renovacion'`, Catastro (hogar), renovación actual con recibos y alternativas; asegura manda a
//     Alberto el Telegram de revisión con ✅ / 👁 / ✏️.
//   · ✅ (`crv_pub:<presupuestoId>`, webhook de Telegram) o «Enviar al cliente por la app» (pantalla) →
//     `POST /api/operador/renovacion/publicar`. SOLO la persona autorizada (from.id = TELEGRAM_CHAT_ID) y sin reintentar.
//
// 🚨 Sale a un TERCERO (el cliente): nada se publica sin ese botón. Elegir en la app NO emite nada.
// 🚨 503 `canal_no_disponible` (el tomador no usa la app: no hay a quién publicarlo) ≠ «el envío falló» (502).
// Las funciones PURAS (decidir el botón, la línea tras pulsar) viven en asegura (`renovacion-alternativas-reglas.ts`): aquí
// se replican SOLO el prefijo y la decisión del botón, con un test que las fija iguales (plataforma no importa asegura).
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_CRV = 'crv'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionBotonCrv = { ok: true; presupuestoId: string } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURO. */
export function decidirBotonCrv(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonCrv {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (accion !== 'pub' || args.length !== 1 || !UUID.test(args[0] ?? '')) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, presupuestoId: args[0].toLowerCase() }
}

/** Línea que sustituye a los botones tras pulsar ✅. PURO. */
export function lineaTrasPublicarCrv(estado: string): string {
  switch (estado) {
    case 'publicado': return '✅ <i>Publicado en su app: le llega el aviso en la campana (y el correo de aviso de acceso, sin detalles).</i>'
    case 'ya_publicado': return '<i>Ya estaba publicado: no se hace nada más.</i>'
    case 'no_vigente': return '⌛ <i>Este mensaje no es el último de este borrador (se rehízo): usa el más reciente.</i>'
    case 'canal_no_disponible': return '⛔ <i>El tomador no usa la app: no se ha publicado. Mándaselo por correo o WhatsApp desde la ficha.</i>'
    case 'sin_migracion': return '🔒 <i>Falta aplicar la migración 2026-11-05b: no se ha publicado nada.</i>'
    case 'caducado': return '⌛ <i>Los precios han caducado: prepara la renovación de nuevo.</i>'
    case 'retirado': return '<i>Ese borrador se retiró: no se publica.</i>'
    case 'sin_necesidades': return '📝 <i>Faltan sus exigencias y necesidades: escríbelas en el presupuesto (✏️) y vuelve a pulsar.</i>'
    case 'no_encontrado': return '⚠️ <i>No encuentro ese borrador de renovación.</i>'
    case 'puerto_sin_configurar': return '⚠️ <i>Falta ASEGURA_OPERADOR_SECRET en plataforma: no se ha publicado.</i>'
    default: return '⚠️ <i>No sé si se ha publicado (fallo del puerto). Mira la póliza antes de repetir.</i>'
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

/** Prepara el borrador (gratis). `actor` = el email de la sesión; lo pone el servidor. */
export function prepararRenovacionAsegura(e: { polizaId: string; actor: string }): Promise<Reenvio> {
  return llamar('/api/operador/renovacion/preparar', { polizaId: e.polizaId, actor: e.actor })
}

/**
 * Publica en la app (el ✅). `via: 'telegram'`: asegura EXIGE `telegramMessageId` y que sea el último mensaje de revisión
 * (sin él, 409). `via: 'pantalla'`: el botón de la ficha, con sesión de la correduría.
 */
export function publicarRenovacionAsegura(e: { presupuestoId: string; actor: string; via: 'telegram' | 'pantalla'; telegramMessageId?: number | null }, actorPuerto?: string): Promise<Reenvio> {
  return llamar('/api/operador/renovacion/publicar', { presupuestoId: e.presupuestoId, actor: e.actor, via: e.via, ...(typeof e.telegramMessageId === 'number' ? { telegramMessageId: e.telegramMessageId } : {}) }, actorPuerto, 25_000)
}

/** El `estado` de la respuesta (para la línea de Telegram). Nunca lanza. */
export function estadoDe(r: Reenvio): string {
  const j = r.json as { estado?: unknown } | null
  return typeof j?.estado === 'string' ? j.estado : `http_${r.status}`
}
