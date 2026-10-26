/**
 * El enlace «completa tus datos para el presupuesto» (24/09/2026), lado portal.
 * Por TOKEN y sin identidad (decisión de Alberto): la página no enseña nada del
 * cliente, solo pide. El portal no escribe en la cartera: lo manda por el puente.
 */
import { CLAVE_NO_LO_SE, SUBCLAVES_DIRECCION, claveDireccion, ramoSolicitud, type CampoSolicitud, type RamoSolicitud } from '@central/module-seguros'
import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type SolicitudLeida =
  /** `tercero`: son datos de otra persona del seguro; se pide su consentimiento. */
  /** `borrador` (26/10/2026): lo que dejó a medias con este enlace (guardado automático); `null` = nada. */
  | { estado: 'ok'; ramo: RamoSolicitud; campos: CampoSolicitud[]; tercero: boolean; borrador: BorradorLeido | null }
  | { estado: 'muerta' }
  | { estado: 'completada' }
  | { estado: 'error' }

export type BorradorLeido = Record<string, string | boolean | string[]>

/**
 * El borrador que devuelve el puente → solo valores escalares (o la lista de «No lo sé») y solo de claves que existen
 * en el formulario. Una forma rara = sin borrador (el formulario se abre en blanco, nunca falla por esto).
 */
export function interpretarBorrador(v: unknown, campos: readonly CampoSolicitud[]): BorradorLeido | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const claves = new Set<string>([CLAVE_NO_LO_SE])
  for (const c of campos) {
    if (c.tipo === 'direccion') for (const s of SUBCLAVES_DIRECCION) claves.add(claveDireccion(c.clave, s))
    else claves.add(c.clave)
  }
  const out: BorradorLeido = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (!claves.has(k)) continue
    if (typeof x === 'string' || typeof x === 'boolean') out[k] = x
    else if (Array.isArray(x)) out[k] = x.filter((y): y is string => typeof y === 'string')
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Lo que devuelve el puente. Una forma rara es `error` (no «muerta»: no se sabe). */
export function interpretarSolicitud(status: number, json: unknown): SolicitudLeida {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status !== 200 || !o) return { estado: 'error' }
  if (o.estado === 'muerta') return { estado: 'muerta' }
  if (o.estado === 'completada') return { estado: 'completada' }
  // 25/10/2026: cualquier ramo de oportunidad (antes, solo moto/auto).
  const ramo = ramoSolicitud(o.ramo)
  if (o.estado === 'ok' && ramo && Array.isArray(o.campos)) {
    const campos = o.campos.filter(
      (c): c is CampoSolicitud =>
        c !== null && typeof c === 'object' && typeof (c as CampoSolicitud).clave === 'string' && typeof (c as CampoSolicitud).etiqueta === 'string',
    )
    if (campos.length > 0) return { estado: 'ok', ramo, campos, tercero: o.tercero === true, borrador: interpretarBorrador(o.borrador, campos) }
  }
  return { estado: 'error' }
}

function puente(): { base: string; secret: string } | null {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return null
  return { base: base.replace(/\/+$/, ''), secret }
}

export async function llamarPuenteSolicitud(init: { metodo: 'GET'; token: string } | { metodo: 'POST'; token: string; respuestas: unknown; consentimiento?: boolean }): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const url = init.metodo === 'GET'
      ? `${p.base}/api/portal/solicitud-datos?token=${encodeURIComponent(init.token)}`
      : `${p.base}/api/portal/solicitud-datos`
    const res = await fetch(url, {
      method: init.metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: init.metodo === 'POST' ? JSON.stringify({ token: init.token, respuestas: init.respuestas, consentimiento: init.consentimiento === true }) : undefined,
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/solicitud-datos] el puente no respondió:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

export async function leerSolicitud(token: string): Promise<SolicitudLeida> {
  const r = await llamarPuenteSolicitud({ metodo: 'GET', token })
  return r ? interpretarSolicitud(r.status, r.json) : { estado: 'error' }
}

// ─── ¿Token vivo? Para las ayudas de dirección del enlace (CP → municipios, callejero) ──
// Esas rutas son públicas (como el enlace): sin un token VIVO no son un servicio anónimo del Catastro. La respuesta
// del puente se recuerda unos minutos por instancia para no llamar a asegura en cada tecla.
const VIVO_MS = 10 * 60_000
const MAX_VIVOS = 300
const vivos = new Map<string, number>()

export const RE_TOKEN_SOLICITUD = /^[A-Za-z0-9_-]{40,60}$/

export async function tokenSolicitudVivo(token: string, ahora = Date.now()): Promise<boolean> {
  if (!RE_TOKEN_SOLICITUD.test(token)) return false
  const hasta = vivos.get(token)
  if (hasta !== undefined && hasta > ahora) return true
  const s = await leerSolicitud(token)
  if (s.estado !== 'ok') return false
  if (vivos.size >= MAX_VIVOS) vivos.delete(vivos.keys().next().value as string)
  vivos.set(token, ahora + VIVO_MS)
  return true
}

// ─── Documentos que sube el cliente (24/09/2026) ─────────────────────────────

export type DocSubido =
  /** `dePoliza`: leído de su póliza actual (botón del seguro actual): se marca «leído de tu póliza» para que lo confirme. */
  | { estado: 'ok'; etiqueta: string; valores: Record<string, string | boolean>; aviso: string | null; dePoliza: boolean }
  | { estado: 'fallo'; texto: string }

/** Lo que devuelve la subida. Solo se proponen valores de texto/sí-no: lo demás se ignora. */
export function interpretarDocSubido(status: number, json: unknown): DocSubido {
  const o = json !== null && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null
  if (status === 200 && o?.ok === true) {
    const valores: Record<string, string | boolean> = {}
    const v = o.valores && typeof o.valores === 'object' && !Array.isArray(o.valores) ? (o.valores as Record<string, unknown>) : {}
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === 'string' || typeof x === 'boolean') valores[k] = x
      else if (typeof x === 'number' && Number.isFinite(x)) valores[k] = String(x)
    }
    return {
      estado: 'ok',
      etiqueta: typeof o.etiqueta === 'string' ? o.etiqueta : 'Documento',
      valores,
      aviso: typeof o.aviso === 'string' ? o.aviso : null,
      dePoliza: o.dePoliza === true,
    }
  }
  const motivo = typeof o?.motivo === 'string' ? o.motivo : null
  if (status === 410) return { estado: 'fallo', texto: 'Este enlace ya no sirve (caducado o ya usado).' }
  if (status === 409) return { estado: 'fallo', texto: motivo ?? 'Ya has subido el máximo de documentos.' }
  if (status === 413 || status === 415 || status === 400) return { estado: 'fallo', texto: motivo ?? 'Ese fichero no vale: sube una foto o un PDF.' }
  if (status === 429) return { estado: 'fallo', texto: 'Demasiados intentos. Espera unos minutos.' }
  if (status === 403 && typeof o?.mensaje === 'string') return { estado: 'fallo', texto: o.mensaje }
  return { estado: 'fallo', texto: 'No se ha podido subir. Vuelve a probar en un momento.' }
}

/** Reenvía el fichero al puente de asegura (multipart). `null` = el puente no respondió. */
export async function subirDocPuente(token: string, fichero: File, consentimiento = false, clase: 'documento' | 'poliza' = 'documento'): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  // La póliza actual pasa por el lector de pólizas (visión hasta ~90 s): más margen que un DNI.
  const reloj = setTimeout(() => control.abort(), clase === 'poliza' ? 110_000 : 55_000)
  try {
    const form = new FormData()
    form.set('token', token)
    form.set('documento', fichero, fichero.name || 'documento')
    form.set('consentimiento', consentimiento ? '1' : '0')
    if (clase === 'poliza') form.set('clase', 'poliza')
    const res = await fetch(`${p.base}/api/portal/solicitud-datos/documento`, {
      method: 'POST',
      headers: { authorization: `Bearer ${p.secret}` },
      body: form,
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/solicitud-datos] subida al puente falló:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}

// ─── Borrador (guardado automático, 26/10/2026) ──────────────────────────────

/** Reenvía el borrador al puente. `null` = el puente no respondió (el formulario sigue igual: es solo un borrador). */
export async function guardarBorradorPuente(token: string, borrador: unknown, consentimiento = false): Promise<{ status: number; json: unknown } | null> {
  const p = puente()
  if (!p) return null
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${p.base}/api/portal/solicitud-datos/borrador`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.secret}` },
      body: JSON.stringify({ token, borrador, consentimiento: consentimiento === true }),
      cache: 'no-store',
      signal: control.signal,
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch (e) {
    console.error('[portal/solicitud-datos] borrador al puente falló:', e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(reloj)
  }
}
