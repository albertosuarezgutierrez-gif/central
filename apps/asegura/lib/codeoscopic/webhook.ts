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

/** `project_id_codeoscopic` es `varchar(50)`: un id más largo no es un id del
 *  vendor (los reales tienen 8 dígitos) y meterlo tal cual tiraría el INSERT
 *  entero — y con él el cuerpo, que es lo que hay que guardar. */
export const MAX_ID_PROYECTO = 50
export const idProyectoValido = (id: string | null): string | null => (id !== null && id.length <= MAX_ID_PROYECTO ? id : null)

const texto = (v: unknown): string | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** `status`/`type`/`event`/`eventType` del vendor → el enum del CRM. Lo que no
 *  se reconoce es `otro`, nunca `emision_ok`. */
export function tipoEvento(valor: unknown): TipoEventoWebhook {
  const s = texto(valor)?.toLowerCase() ?? ''
  if (!s) return 'otro'
  // Negativos PRIMERO y el positivo por coincidencia EXACTA: «No emitida»,
  // «NotApproved» o «IssuedWithErrors» no pueden acabar en `emision_ok`.
  if (/rechaz|reject|denied|refused|cancel/.test(s)) return 'rechazada'
  if (/venci|expir/.test(s)) return 'vencida'
  if (/error|fail/.test(s)) return 'error'
  if (/^(emision_ok|issued|approved|accepted|emitida?)$/.test(s)) return 'emision_ok'
  return 'otro'
}

function leerObjeto(o: Record<string, unknown>): { tipo: TipoEventoWebhook; proyectoId: string | null; numeroPoliza: string | null } {
  const insurance = typeof o.insurance === 'object' && o.insurance !== null ? (o.insurance as Record<string, unknown>) : null
  const status = typeof o.status === 'object' && o.status !== null ? (o.status as Record<string, unknown>) : null
  const proyectoId = idProyectoValido(
    texto(o.project_id) ?? texto(o.projectId) ?? texto(o.insuranceId) ?? texto(o.insurance_id) ?? texto(insurance?.id) ?? texto(o.id),
  )
  // El ESTADO manda sobre el discriminador de recurso: `{type:'insurance', status:{id:'Approved'}}`
  // es una aprobada, no un «otro». El objeto del CRM (`event_type`) no trae status.
  const tipo = tipoEvento(status?.id ?? o.status ?? o.event_type ?? o.eventType ?? o.type ?? o.event)
  return { tipo, proyectoId, numeroPoliza: texto(o.policyNumber) ?? texto(o.policy_number) }
}

export type FilaWebhook = {
  /** Hash de dedupe (64 hex): el del cuerpo entero, o sha256(`<hash>:<i>`) por elemento de un array. */
  hash: string
  /** Lo que se persiste en `raw_payload`: el objeto, o el elemento i del array TAL CUAL. */
  contenido: unknown
  evento: EventoWebhook
}

function leerUno(crudo: unknown, raiz: RaizWebhook, elementos: number): EventoWebhook {
  if (typeof crudo === 'object' && crudo !== null && !Array.isArray(crudo)) {
    return { raiz, elementos, ...leerObjeto(crudo as Record<string, unknown>) }
  }
  return { raiz, elementos, tipo: 'otro', proyectoId: null, numeroPoliza: null }
}

/** Interpreta UN objeto (o algo que no lo es) como evento. */
export function leerEventoWebhook(crudo: unknown): EventoWebhook {
  if (Array.isArray(crudo)) return { raiz: 'array', elementos: crudo.length, tipo: 'otro', proyectoId: null, numeroPoliza: null }
  if (typeof crudo === 'object' && crudo !== null) return leerUno(crudo, 'objeto', 1)
  return { raiz: 'otro', elementos: 0, tipo: 'otro', proyectoId: null, numeroPoliza: null }
}

/**
 * Las filas que se persisten para un cuerpo. Un objeto es una fila. **Un array
 * es una fila POR ELEMENTO** (hash `<sha256(cuerpo)>:<i>`), porque mezclar dos
 * elementos en una fila atribuiría el estado del segundo al proyecto del
 * primero — y el emisor real manda justo arrays de 2 `{insurance}`. Un array
 * vacío o una raíz que no es JSON-objeto se guarda como una sola fila con el
 * cuerpo tal cual: lo raro también se conserva.
 */
export function filasWebhook(cuerpoCrudo: string, parseado: unknown): FilaWebhook[] {
  const hash = hashPayload(cuerpoCrudo)
  if (Array.isArray(parseado) && parseado.length > 0) {
    // `payload_hash` es varchar(64): el hash por elemento es sha256 de `<hash>:<i>`, no la concatenación.
    return parseado.map((el, i) => ({ hash: hashPayload(`${hash}:${i}`), contenido: el, evento: leerUno(el, 'array', parseado.length) }))
  }
  return [{ hash, contenido: parseado, evento: leerEventoWebhook(parseado) }]
}
