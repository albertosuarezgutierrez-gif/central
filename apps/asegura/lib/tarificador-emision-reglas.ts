// Reglas PURAS de la emisión asistida por el robot (10/10/2026). La lógica de fondo (hash, token, canje, permiso,
// precondiciones) vive en `@central/module-tarificacion` (emision.ts); aquí, lo propio del puerto de asegura: leer los
// cuerpos del worker, a qué estado pasa el trabajo y los textos (sin datos personales salvo iniciales).

import { pareceTokenEmision, verificarFirmaAutorizacionEmision, ENV_FIRMA_AUTORIZACION, type CamposFirmaAutorizacion, type TipoError } from '@central/module-tarificacion'
import { MAX_BYTES_ADJUNTO } from './tarificador-reglas.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Id de Telegram de la ÚNICA persona que autoriza (Alberto). Ausente = nadie autoriza (fail-closed). */
export const ENV_AUTORIZADOR = 'TARIFICADOR_EMISION_TELEGRAM_ID'
export function autorizadorEmision(env: Record<string, string | undefined>): string | null {
  const v = (env[ENV_AUTORIZADOR] ?? '').trim()
  return /^\d{3,20}$/.test(v) ? v : null
}

/**
 * Puerta de `POST /api/operador/tarificador/emision/autorizar` (revisión de seguridad 10/10/2026). El Bearer de operador
 * NO basta: el cuerpo tiene que venir firmado (HMAC) con `TARIFICADOR_EMISION_WEBHOOK_SECRET`, que solo tiene el webhook de
 * Telegram de plataforma. Sin secreto → 503 (nadie autoriza); sin firma, firma mala o vieja → 403; campos raros → 400.
 */
export function comprobarFirmaAutorizar(cuerpo: unknown, secreto: string | null, ahoraMs: number): { ok: true; campos: CamposFirmaAutorizacion } | { ok: false; status: 400 | 403 | 503; motivo: string } {
  const v = verificarFirmaAutorizacionEmision(secreto, cuerpo, ahoraMs)
  if (v.ok) return v
  if (v.motivo === 'sin_secreto') return { ok: false, status: 503, motivo: `firma sin configurar (${ENV_FIRMA_AUTORIZACION})` }
  if (v.motivo === 'campos') return { ok: false, status: 400, motivo: "trabajoId (uuid), decision ('ok'|'no'), hashCorto, autorizadoPor y ts son obligatorios" }
  return { ok: false, status: 403, motivo: `firma no válida (${v.motivo})` }
}

const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const centimos = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100_000_000 ? v : null)

function captura(v: unknown): { ok: true; bytes: Buffer | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true, bytes: null }
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(v)) return { ok: false, error: 'capturaBase64 no es base64' }
  const b = Buffer.from(v, 'base64')
  if (b.length > MAX_BYTES_ADJUNTO) return { ok: false, error: 'captura demasiado grande' }
  return { ok: true, bytes: b }
}

export type ResultadoEmisionWorker =
  | { trabajoId: string; resultado: 'pre_emision'; primaCents: number; captura: Buffer | null }
  | { trabajoId: string; resultado: 'emitida'; numeroPoliza: string | null; captura: Buffer | null }
  | { trabajoId: string; resultado: 'incierto' | 'no_emitida'; motivo: string; captura: Buffer | null }

/** `POST /api/tarificador/emision/resultado`. Todo lo que no encaja → 400 (nada se escribe a medias). */
export function leerResultadoEmision(entrada: unknown): { ok: true; r: ResultadoEmisionWorker } | { ok: false; error: string } {
  const o = objeto(entrada)
  if (!o) return { ok: false, error: 'cuerpo JSON requerido' }
  const trabajoId = typeof o.trabajoId === 'string' && UUID.test(o.trabajoId) ? o.trabajoId : null
  if (!trabajoId) return { ok: false, error: 'trabajoId no es un uuid' }
  const c = captura(o.capturaBase64)
  if (!c.ok) return { ok: false, error: c.error }
  if (o.resultado === 'pre_emision') {
    const primaCents = centimos(o.primaCents)
    if (primaCents === null) return { ok: false, error: 'primaCents tiene que ser un entero positivo' }
    return { ok: true, r: { trabajoId, resultado: 'pre_emision', primaCents, captura: c.bytes } }
  }
  if (o.resultado === 'emitida') {
    const n = typeof o.numeroPoliza === 'string' ? o.numeroPoliza.trim() : ''
    // Un nº de póliza raro no se guarda (puede ser texto de la pantalla): null = «no se pudo leer», no «no hay».
    const numeroPoliza = /^[A-Z0-9][A-Z0-9/.-]{3,39}$/i.test(n) ? n : null
    return { ok: true, r: { trabajoId, resultado: 'emitida', numeroPoliza, captura: c.bytes } }
  }
  if (o.resultado === 'incierto' || o.resultado === 'no_emitida') {
    const motivo = typeof o.motivo === 'string' ? o.motivo.slice(0, 500) : ''
    return { ok: true, r: { trabajoId, resultado: o.resultado, motivo, captura: c.bytes } }
  }
  return { ok: false, error: "resultado tiene que ser 'pre_emision', 'emitida', 'incierto' o 'no_emitida'" }
}

/** `POST /api/tarificador/emision/canje`. El token viaja en el cuerpo (nunca en la URL: acabaría en logs). */
export function leerCanje(entrada: unknown): { ok: true; trabajoId: string; token: string; primaCents: number } | { ok: false; error: string } {
  const o = objeto(entrada)
  if (!o) return { ok: false, error: 'cuerpo JSON requerido' }
  const trabajoId = typeof o.trabajoId === 'string' && UUID.test(o.trabajoId) ? o.trabajoId : null
  if (!trabajoId) return { ok: false, error: 'trabajoId no es un uuid' }
  if (!pareceTokenEmision(o.token)) return { ok: false, error: 'token ausente o mal formado' }
  const primaCents = centimos(o.primaCents)
  if (primaCents === null) return { ok: false, error: 'primaCents tiene que ser un entero positivo' }
  return { ok: true, trabajoId, token: o.token, primaCents }
}

/**
 * Tras el clic: `emitida` CON nº de póliza → `emitido`. Sin nº legible, o `incierto` → `requiere_humano` (el estado en la
 * compañía es incierto: una persona mira el portal). `no_emitida` (falló ANTES del clic) → `requiere_humano` también:
 * nunca se reintenta solo; se pide una emisión nueva.
 */
export function estadoTrasResultado(r: Exclude<ResultadoEmisionWorker, { resultado: 'pre_emision' }>): { estado: 'emitido' | 'requiere_humano'; resultadoAutorizacion: 'emitida' | 'incierto' | 'fallo'; error: { tipo: TipoError; mensaje: string } | null } {
  if (r.resultado === 'emitida' && r.numeroPoliza) return { estado: 'emitido', resultadoAutorizacion: 'emitida', error: null }
  if (r.resultado === 'no_emitida') {
    return { estado: 'requiere_humano', resultadoAutorizacion: 'fallo', error: { tipo: 'emision', mensaje: `No se emitió (el robot paró antes de pulsar): ${r.motivo || 'sin motivo'}`.slice(0, 600) } }
  }
  return {
    estado: 'requiere_humano',
    resultadoAutorizacion: 'incierto',
    error: { tipo: 'emision', mensaje: 'Se pulsó emitir en el portal y no se pudo confirmar el nº de póliza: mira el portal de la compañía ANTES de nada (puede estar emitida). No se reintenta.' },
  }
}

/**
 * El lease de un trabajo de emisión venció (o el worker cayó) DESPUÉS de canjear el token: el clic pudo salir. Lo que
 * escribe el barrido en el error (lo lee Alberto en el Telegram y en la bandeja). Empieza por «INCIERTO» a propósito.
 */
export const MENSAJE_EMISION_INCIERTA = 'INCIERTO: la póliza puede estar emitida, revisar ePAC antes de cualquier acción. El robot canjeó el permiso y no devolvió resultado a tiempo. No se reintenta ni se puede pedir otra emisión de este presupuesto hasta resolverlo.'

/** ¿Hay una autorización CONSUMIDA sin desenlace? (canje OK y luego nada, o `incierto`). Entonces el clic pudo salir. */
export function autorizacionSinResolver(a: { consumidoAt: Date | null; resultado: string | null } | null | undefined): boolean {
  return !!a?.consumidoAt && (a.resultado === null || a.resultado === 'incierto')
}

/** `emitida` que llega DESPUÉS de que el barrido diera el lease por vencido: se guarda el nº y se re-avisa. */
export function mensajeEmisionTardia(numeroPoliza: string | null): string {
  return numeroPoliza
    ? `Emitida (respuesta tardía del robot, tras vencer su plazo): póliza ${numeroPoliza}. Compruébala en ePAC, regístrala en la ficha y, si sustituye a otra, ANULA la anterior a mano.`
    : `${MENSAJE_EMISION_INCIERTA} (El robot respondió tarde «emitida» sin un nº de póliza legible.)`
}

/** Mensaje cuando la prima de la pantalla previa no es EXACTAMENTE la aceptada (tolerancia 0 €). */
export function mensajePrimaDistinta(pantallaCents: number, aceptadaCents: number | null): string {
  const e = (c: number | null) => (c === null ? '—' : `${Math.floor(c / 100).toLocaleString('es-ES')},${String(c % 100).padStart(2, '0')}€`)
  return `La prima de la pantalla previa (${e(pantallaCents)}) no es la que aceptó el cliente (${e(aceptadaCents)}): no se pide autorización ni se emite.`
}

/** Iniciales del tomador para el Telegram (nunca el nombre entero). */
export function iniciales(nombre: string | null | undefined, apellidos: string | null | undefined): string {
  const ini = [nombre, apellidos]
    .flatMap((t) => String(t ?? '').trim().split(/\s+/))
    .filter(Boolean)
    .slice(0, 3)
    .map((p) => p.charAt(0).toUpperCase() + '.')
    .join('')
  return ini || '—'
}
