// Receptor del webhook de Codeoscopic — la parte PURA (sin Prisma, sin red).
//
// 13/09/2026, respuesta de Manuel: Codeoscopic tiene el webhook dado de alta
// (confirmado por JM el 15/06, LOO-322) hacia `POST app.grupoasegura.com/api/
// webhooks/codeoscopic` con HTTP Basic. El emisor REAL (UA Apache-HttpAsyncClient,
// cada 30-90 min) manda un ARRAY JSON de 2 elementos, y el receptor del CRM solo
// entiende un objeto con `project_id`: descarta esos envíos con 200 y NO los
// persiste. Nadie ha visto nunca lo que traen. Por eso este receptor:
//   1. persiste TODO payload autenticado tal cual (`raw_payload`), sea objeto o
//      array — primero se guarda, después se interpreta;
//   2. deduplica por hash del cuerpo (índice único `uq_codeoscopic_webhook_events_hash`
//      del CRM, que aquí se respeta);
//   3. nunca acuña ni cambia el estado de un proyecto: la reconciliación sigue
//      siendo `GET /insurances/{id}` (`reintento-emision.ts`). El webhook AVISA.

import { createHash, timingSafeEqual } from 'node:crypto'

export type TipoEventoWebhook = 'emision_ok' | 'rechazada' | 'vencida' | 'error' | 'otro'
export type RaizWebhook = 'objeto' | 'array' | 'otro'

export type EventoWebhook = {
  raiz: RaizWebhook
  /** Nº de elementos si la raíz es un array; 1 si es objeto; 0 si otra cosa. */
  elementos: number
  tipo: TipoEventoWebhook
  /** Id del proyecto del vendor (`project_id`, `insurance.id`, `insuranceId`, `id`…), si se ve. */
  proyectoId: string | null
  /** Nº de póliza si el payload lo trae (`policyNumber`), sin interpretarlo. */
  numeroPoliza: string | null
}

/** sha256 hex del cuerpo CRUDO (bytes, no el JSON re-serializado): así dos
 *  envíos idénticos del vendor colapsan y uno reordenado no. */
export function hashPayload(cuerpoCrudo: string): string {
  return createHash('sha256').update(cuerpoCrudo, 'utf8').digest('hex')
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest()

/**
 * `true` solo si la cabecera es `Basic <base64(user:pass)>` y coincide con las
 * credenciales configuradas. Comparación en tiempo constante sobre digests
 * (misma longitud siempre: la comparación no filtra la longitud del secreto).
 * Sin credenciales configuradas NUNCA autoriza (fail-closed).
 */
export function autorizacionBasica(cabecera: string | null | undefined, usuario: string | undefined, contrasena: string | undefined): boolean {
  if (!usuario || !contrasena) return false
  const m = (cabecera ?? '').match(/^\s*Basic\s+([A-Za-z0-9+/=]+)\s*$/i)
  if (!m) return false
  let decodificado: string
  try {
    decodificado = Buffer.from(m[1], 'base64').toString('utf8')
  } catch {
    return false
  }
  const sep = decodificado.indexOf(':')
  if (sep < 0) return false
  const u = decodificado.slice(0, sep)
  const p = decodificado.slice(sep + 1)
  const okU = timingSafeEqual(digest(u), digest(usuario))
  const okP = timingSafeEqual(digest(p), digest(contrasena))
  return okU && okP
}

const texto = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** `status`/`type`/`event`/`eventType` del vendor → el enum del CRM. Lo que no
 *  se reconoce es `otro`, nunca `emision_ok`. */
export function tipoEvento(valor: unknown): TipoEventoWebhook {
  const s = texto(valor)?.toLowerCase() ?? ''
  if (!s) return 'otro'
  if (/emision_ok|issued|approved|accepted|emitid/.test(s)) return 'emision_ok'
  if (/rechaz|reject|denied|refused|cancel/.test(s)) return 'rechazada'
  if (/venci|expir/.test(s)) return 'vencida'
  if (/error|fail/.test(s)) return 'error'
  return 'otro'
}

function leerObjeto(o: Record<string, unknown>): { tipo: TipoEventoWebhook; proyectoId: string | null; numeroPoliza: string | null } {
  const insurance = typeof o.insurance === 'object' && o.insurance !== null ? (o.insurance as Record<string, unknown>) : null
  const status = typeof o.status === 'object' && o.status !== null ? (o.status as Record<string, unknown>) : null
  const proyectoId =
    texto(o.project_id) ?? texto(o.projectId) ?? texto(o.insuranceId) ?? texto(o.insurance_id) ?? texto(insurance?.id) ?? texto(o.id)
  const tipo = tipoEvento(o.event_type ?? o.eventType ?? o.type ?? o.event ?? status?.id ?? o.status)
  return { tipo, proyectoId, numeroPoliza: texto(o.policyNumber) ?? texto(o.policy_number) }
}

/**
 * Interpreta el cuerpo YA PARSEADO. Un array se lee elemento a elemento y se
 * queda con el primer id/tipo que aparezca; el conteo de elementos viaja aparte
 * para que la fila diga «array de 2» y no «un evento».
 */
export function leerEventoWebhook(crudo: unknown): EventoWebhook {
  if (Array.isArray(crudo)) {
    let tipo: TipoEventoWebhook = 'otro'
    let proyectoId: string | null = null
    let numeroPoliza: string | null = null
    for (const el of crudo) {
      if (typeof el !== 'object' || el === null || Array.isArray(el)) continue
      const r = leerObjeto(el as Record<string, unknown>)
      if (tipo === 'otro') tipo = r.tipo
      proyectoId ??= r.proyectoId
      numeroPoliza ??= r.numeroPoliza
    }
    return { raiz: 'array', elementos: crudo.length, tipo, proyectoId, numeroPoliza }
  }
  if (typeof crudo === 'object' && crudo !== null) {
    return { raiz: 'objeto', elementos: 1, ...leerObjeto(crudo as Record<string, unknown>) }
  }
  return { raiz: 'otro', elementos: 0, tipo: 'otro', proyectoId: null, numeroPoliza: null }
}
