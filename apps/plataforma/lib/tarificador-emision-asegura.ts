// EMISIÓN asistida por el robot del tarificador (10/10/2026): la parte de PLATAFORMA. Diseño en
// docs/TARIFICADOR-EMISION-DISENO.md; el estado vive en asegura (`/api/operador/tarificador/emision/*`).
//
//   · cron (cada 10 min, junto al aviso de verificación): lee de asegura qué falta por avisar y manda a Alberto la
//     captura de la pantalla previa + botones «✅ Emitir» (`emi_ok:<trabajo>`) / «❌ Cancelar» (`emi_no:<trabajo>`), o el
//     desenlace (emitida / parada). Solo si salió, se marca en asegura.
//   · webhook de Telegram, prefijo `emi`: SOLO `from.id == TELEGRAM_CHAT_ID` (no basta el chat: en un grupo cualquiera
//     pulsaría). Se contesta el botón YA y la llamada a asegura va en `after()`. Asegura vuelve a comprobar el id.
//     🔐 La llamada va FIRMADA (HMAC con `TARIFICADOR_EMISION_WEBHOOK_SECRET`, que solo tienen este webhook y asegura):
//     el Bearer de operador solo no autoriza. El botón lleva el hash corto de la pantalla previa que se enseñó.
//   · solicitar: proxy de `/correduria` → asegura, SOLO para el correo de `TARIFICADOR_EMISION_SOLICITANTE`.
//
// 🚨 Sin datos personales en Telegram: iniciales, referencia del presupuesto, compañía, ramo y prima. La captura de la
//    pantalla previa SÍ va (la pide el diseño para que Alberto vea lo que autoriza) y solo al chat de Alberto.
// 🚨 Nunca se manda nada a terceros: todo va al chat de Alberto.

import { ENV_FIRMA_AUTORIZACION, LARGO_HASH_CORTO, firmarAutorizacionEmision, hashCortoEmision } from '@central/module-tarificacion'
import { cabecerasPuerto } from './puerto-actor.ts'

export const PREFIJO_EMISION = 'emi'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null)

// ─── Botón (PURO) ────────────────────────────────────────────────────────────

export type DecisionBotonEmision = { ok: true; trabajoId: string; decision: 'ok' | 'no'; hashCorto: string; autorizadoPor: string } | { ok: false; toast: string }
const HASH_CORTO = new RegExp(`^[0-9a-f]{${LARGO_HASH_CORTO}}$`)

/**
 * ¿Vale esta pulsación de `emi_<accion>:<trabajoId>`? Solo la PERSONA autorizada (from.id EXACTO = `TELEGRAM_CHAT_ID`,
 * que en el chat privado de Alberto es su id); sin chat configurado, nadie. Acción y trabajo bien formados.
 */
export function decidirBotonEmision(cb: { from?: { id?: unknown } | null } | null | undefined, accion: string, args: readonly string[], chatAutorizado: string | undefined): DecisionBotonEmision {
  const esperado = String(chatAutorizado ?? '').trim()
  const quien = String(cb?.from?.id ?? '').trim()
  if (!esperado || !quien || quien !== esperado) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (accion !== 'ok' && accion !== 'no') return { ok: false, toast: 'Botón no válido' }
  const trabajoId = args[0] ?? ''
  const hashCorto = args[1] ?? ''
  if (!UUID.test(trabajoId) || !HASH_CORTO.test(hashCorto) || args.length !== 2) return { ok: false, toast: 'Botón no válido' }
  return { ok: true, trabajoId, decision: accion, hashCorto, autorizadoPor: quien }
}

// ─── Avisos (PURO) ───────────────────────────────────────────────────────────

export type AvisoEmision = {
  trabajoId: string
  tipo: 'pedir_autorizacion' | 'emitida' | 'requiere_humano'
  compania: string
  ramo: string
  iniciales: string
  referencia: string | null
  primaCents: number | null
  numeroPoliza: string | null
  mensaje: string | null
  caducaAt: string | null
  capturaBase64: string | null
  /** Hash de la pantalla previa (64 hex). Obligatorio en `pedir_autorizacion`: sin él no hay botón que firmar. */
  hashDatos: string | null
}

export type LecturaAvisosEmision = { estado: 'ok'; pendientes: AvisoEmision[]; ilegibles: number } | { estado: 'sin_configurar' } | { estado: 'sin_esquema' } | { estado: 'error'; causa: string }

export function interpretarAvisosEmision(status: number, json: unknown): LecturaAvisosEmision {
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/emision/avisos desplegado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_esquema') return { estado: 'sin_esquema' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.pendientes)) return { estado: 'error', causa: cadena(o.causa) ?? `respuesta ilegible (HTTP ${status})` }
  const pendientes: AvisoEmision[] = []
  let ilegibles = 0
  for (const f of o.pendientes) {
    const r = (typeof f === 'object' && f !== null ? f : {}) as Record<string, unknown>
    const trabajoId = cadena(r.trabajoId)
    const tipo = r.tipo === 'pedir_autorizacion' || r.tipo === 'emitida' || r.tipo === 'requiere_humano' ? r.tipo : null
    const compania = cadena(r.compania)
    const hashDatos = typeof r.hashDatos === 'string' && /^[0-9a-f]{64}$/.test(r.hashDatos) ? r.hashDatos : null
    if (!trabajoId || !UUID.test(trabajoId) || !tipo || !compania || (tipo === 'pedir_autorizacion' && !hashDatos)) { ilegibles++; continue }
    pendientes.push({
      trabajoId, tipo, compania, ramo: cadena(r.ramo) ?? '', iniciales: cadena(r.iniciales) ?? '—', referencia: cadena(r.referencia),
      primaCents: entero(r.primaCents), numeroPoliza: cadena(r.numeroPoliza), mensaje: cadena(r.mensaje), caducaAt: cadena(r.caducaAt),
      capturaBase64: cadena(r.capturaBase64), hashDatos,
    })
  }
  return { estado: 'ok', pendientes, ilegibles }
}

const escapar = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const nombre = (c: string): string => (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'La compañía')

/** `34755` → `347,55€` (miles con punto también en 4 cifras). `null` → `—`. */
export function euros(cents: number | null): string {
  if (cents === null) return '—'
  const e = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${e},${String(cents % 100).padStart(2, '0')}€`
}

function hora(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Texto (HTML de Telegram) de UN aviso. Sin NIF, sin dirección, sin nombre: iniciales. */
export function componerAvisoEmision(a: AvisoEmision): string {
  const cab = `${escapar(nombre(a.compania))} · ${escapar(a.ramo || 'ramo')} · ${escapar(a.iniciales)}${a.referencia ? ` · ${escapar(a.referencia)}` : ''}`
  if (a.tipo === 'pedir_autorizacion') {
    return `🖊️ <b>¿Emito esta póliza?</b>\n${cab}\nPrima en la pantalla previa: <b>${euros(a.primaCents)}</b> (la misma que aceptó el cliente)\n` +
      `Trabajo ${escapar(a.trabajoId.slice(0, 8))} · caduca ${hora(a.caducaAt)}\n` +
      `El robot pulsará UN botón una vez. La anulación de la póliza anterior la haces tú a mano.`
  }
  if (a.tipo === 'emitida') {
    return `✅ <b>Emitida</b> por el robot: póliza ${escapar(a.numeroPoliza ?? '—')}\n${cab}\n` +
      `Pendiente a mano: registrar la póliza en la ficha y, si sustituye a otra, ANULAR la anterior (no se hace sola).`
  }
  return `⚠️ <b>Emisión parada</b>\n${cab}\n${escapar(a.mensaje ?? 'El robot necesita que una persona lo mire.')}\nNo se reintenta solo.`
}

/** Botones de la petición, atados a la pantalla previa enseñada. callback_data ≤ 64 bytes: `emi_ok:<uuid>:<16 hex>` = 60. */
export function botonesEmision(trabajoId: string, hashDatos: string): { texto: string; callback: string }[][] {
  const h = hashCortoEmision(hashDatos)
  return [[{ texto: '✅ Emitir', callback: `${PREFIJO_EMISION}_ok:${trabajoId}:${h}` }, { texto: '❌ Cancelar', callback: `${PREFIJO_EMISION}_no:${trabajoId}:${h}` }]]
}

/** Texto tras pulsar (sustituye los botones del mensaje). */
export function lineaTrasPulsar(decision: 'ok' | 'no', r: { estado: string; motivo?: string | null }): string {
  if (r.estado === 'autorizado') return '⏳ <i>Autorizado: el robot vuelve a la pantalla previa, re-comprueba el precio y pulsa una vez.</i>'
  if (r.estado === 'cancelado') return '❌ <i>Cancelada: no se emite.</i>'
  if (r.estado === 'sin_cambios') return decision === 'ok' ? '⏳ <i>Ya estaba autorizada.</i>' : '<i>Ya estaba cancelada.</i>'
  return `⚠️ <i>No se ha podido ${decision === 'ok' ? 'autorizar' : 'cancelar'}: ${escapar(r.motivo ?? 'error')}</i>`
}

// ─── Solicitante (PURO) ──────────────────────────────────────────────────────

export const ENV_SOLICITANTE = 'TARIFICADOR_EMISION_SOLICITANTE'
/** ¿Puede pedir emisiones esta sesión? Solo el correo configurado (Alberto). Sin env → nadie. */
export function puedeSolicitarEmision(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const esperado = (env[ENV_SOLICITANTE] ?? '').trim().toLowerCase()
  const e = String(email ?? '').trim().toLowerCase()
  return !!esperado && !!e && e === esperado
}

// ─── Red ─────────────────────────────────────────────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function puerto(ruta: string, init: RequestInit, actor?: string): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}/api/operador/tarificador/emision${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}), ...(await cabecerasPuerto(secret, actor)) },
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function leerAvisosEmision(): Promise<LecturaAvisosEmision> {
  try {
    const r = await puerto('/avisos', { method: 'GET' })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarAvisosEmision(r.status, r.json)
  } catch (e) {
    return { estado: 'error', causa: `no se pudo llegar a asegura (${e instanceof Error ? e.message : String(e)})` }
  }
}

export async function marcarAvisosEmision(ids: string[]): Promise<boolean> {
  if (!ids.length) return true
  try {
    const r = await puerto('/avisos', { method: 'POST', body: JSON.stringify({ trabajoIds: ids }) })
    return r !== null && r.status === 200 && (r.json as { estado?: unknown } | null)?.estado === 'ok'
  } catch {
    return false
  }
}

/**
 * Cuerpo FIRMADO de la pulsación (PURO salvo el reloj): HMAC-SHA256 de (trabajo, decisión, hash corto, from.id, ts) con
 * el secreto propio del webhook. Lanza sin secreto válido (fail-closed: no se llama a asegura).
 */
export function cuerpoFirmadoAutorizacion(secreto: string, d: { trabajoId: string; decision: 'ok' | 'no'; hashCorto: string; autorizadoPor: string }, ahoraMs = Date.now()) {
  const campos = { trabajoId: d.trabajoId, decision: d.decision, hashCorto: d.hashCorto, autorizadoPor: d.autorizadoPor, ts: Math.floor(ahoraMs / 1000) }
  return { ...campos, firma: firmarAutorizacionEmision(secreto, campos) }
}

/**
 * Reenvía la decisión del botón a asegura, firmada. `leerSecreto` = `() => requireSecret(ENV_FIRMA_AUTORIZACION)` en el
 * webhook (aquí no se importa core-identity: este fichero lo carga `node --test`). Si lanza, NO se llama a asegura.
 * Devuelve `{estado, motivo}` para pintar la línea del mensaje.
 */
export async function autorizarEnAsegura(d: { trabajoId: string; decision: 'ok' | 'no'; hashCorto: string; autorizadoPor: string }, leerSecreto: () => string): Promise<{ estado: string; motivo: string | null }> {
  let cuerpo: ReturnType<typeof cuerpoFirmadoAutorizacion>
  try {
    cuerpo = cuerpoFirmadoAutorizacion(leerSecreto(), d)
  } catch {
    return { estado: 'error', motivo: `firma sin configurar (${ENV_FIRMA_AUTORIZACION})` }
  }
  try {
    const r = await puerto('/autorizar', { method: 'POST', body: JSON.stringify(cuerpo) }, 'sistema:telegram-emision')
    if (r === null) return { estado: 'error', motivo: 'puerto sin configurar' }
    const j = (r.json ?? {}) as Record<string, unknown>
    return { estado: cadena(j.estado) ?? `HTTP ${r.status}`, motivo: cadena(j.motivo) ?? cadena(j.mensaje) }
  } catch (e) {
    return { estado: 'error', motivo: e instanceof Error ? e.message.slice(0, 120) : 'error' }
  }
}

export async function solicitarEnAsegura(b: { presupuestoId: string; trabajoOrigenId: string }): Promise<{ status: number; json: unknown }> {
  const r = await puerto('', { method: 'POST', body: JSON.stringify(b) })
  return r ?? { status: 503, json: { estado: 'error', mensaje: 'puerto sin configurar (ASEGURA_OPERADOR_SECRET)' } }
}
