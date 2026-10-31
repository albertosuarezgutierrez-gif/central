// Felicitación de cumpleaños a EX-CLIENTES de Grupo ASegura (30/10/2026): la parte de PLATAFORMA.
// asegura (cron `felicitaciones`, puerta `ASEGURA_FELICITACIONES_EXCLIENTES=aprobar`) manda a Alberto el texto con
// «✅ Enviar» (`fex_ok:<clienteId>:<año>`) / «❌ Descartar» (`fex_no:…`). El webhook de Telegram los recibe y, SOLO si
// pulsa la persona autorizada (from.id = TELEGRAM_CHAT_ID), reenvía la decisión a asegura
// (`POST /api/operador/felicitaciones/exclientes`), que reclama la fila antes de mandar (doble clic = un correo).
// Sale a un TERCERO: nada se envía sin ese botón.
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_FEX = 'fex'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type DecisionBotonFex = { ok: true; decision: 'ok' | 'no'; clienteId: string; anio: number } | { ok: false; toast: string }

/** ¿Vale esta pulsación? Solo el titular (from.id EXACTO); sin chat configurado, nadie. PURO. */
export function decidirBotonFex(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonFex {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if ((accion !== 'ok' && accion !== 'no') || args.length !== 2) return { ok: false, toast: 'Botón no válido' }
  const [clienteId, a] = args
  if (!UUID.test(clienteId) || !/^\d{4}$/.test(a)) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, decision: accion, clienteId, anio: Number(a) }
}

/** Línea que sustituye a los botones tras pulsar. PURO. */
export function lineaTrasPulsarFex(decision: 'ok' | 'no', estado: string): string {
  switch (estado) {
    case 'enviada': return '✅ <i>Felicitación enviada.</i>'
    case 'descartada': return '❌ <i>Descartada: no sale nada.</i>'
    case 'sin_cambios': return '<i>Ya estaba decidida: no se hace nada más.</i>'
    case 'caducada': return '⌛ <i>Era de otro día: no se envía (descartada).</i>'
    case 'ya_no_aplica': return '<i>Ya no es ex-cliente (o la ficha se fusionó): no se envía.</i>'
    case 'sin_destino': return '<i>Ya no tiene email válido o se dio de baja: no se envía.</i>'
    case 'puerta_cerrada': return '🔒 <i>La puerta ASEGURA_FELICITACIONES_EXCLIENTES está apagada: no se envía.</i>'
    case 'sin_correo_configurado': return '⚠️ <i>Sin proveedor de correo en asegura: sigue pendiente, pulsa ✅ cuando esté arreglado.</i>'
    case 'fallida': return '⚠️ <i>El proveedor rechazó el correo: no se reintenta solo.</i>'
    default: return `⚠️ <i>No se ha podido ${decision === 'ok' ? 'enviar' : 'descartar'} (${estado}). Mira la ficha antes de repetir.</i>`
  }
}

/** Reenvía la decisión a asegura. Nunca lanza: devuelve el `estado` para pintar la línea. */
export async function decidirFexEnAsegura(d: { decision: 'ok' | 'no'; clienteId: string; anio: number }): Promise<string> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return 'puerto_sin_configurar'
  try {
    const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
    const res = await fetch(`${base}/api/operador/felicitaciones/exclientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await cabecerasPuerto(secret, 'sistema:telegram-felicitacion')) },
      body: JSON.stringify(d),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    })
    const j = (await res.json().catch(() => null)) as { estado?: unknown } | null
    return typeof j?.estado === 'string' ? j.estado : `HTTP ${res.status}`
  } catch (e) {
    return e instanceof Error ? e.message.slice(0, 80) : 'error'
  }
}
