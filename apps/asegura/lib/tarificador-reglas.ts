// Tarificador RPA — reglas PURAS del orquestador (05/10/2026). Sin BD ni red: `node --test`.
//
// El canal: apps/asegura encola en `seguros.tarificacion_trabajos`, lanza una máquina EFÍMERA de Fly
// (app `asegura-tarificador`, auto_destroy) por trabajo, y el worker le pide el riesgo y le devuelve
// el resultado por HTTP con su propio Bearer (`TARIFICADOR_WORKER_SECRET`). TARIFICAR ≠ EMITIR.

import { envDeMaquina, esTipoError, validarOfertas, type OfertaNormalizada, type TipoError } from '@central/module-tarificacion'

/** Interruptor general. APAGADO salvo `TARIFICADOR_RPA_ACTIVO=1` exacto (fail-closed). */
export function rpaActivo(env: Record<string, string | undefined>): boolean {
  return env.TARIFICADOR_RPA_ACTIVO === '1'
}

/** Región de Fly del worker (París, la más cercana con buena latencia a los portales españoles). */
export const REGION_FLY = 'cdg'
/** Lease de un trabajo `en_curso`: el worker tiene 4 min de tope global; 6 min dan margen al arranque. */
export const LEASE_MS = 6 * 60_000
/** Techo de cada PDF/captura (la tabla `documentos` admite 10 MB; el cuerpo de Vercel, ~4,5 MB). */
export const MAX_BYTES_ADJUNTO = 4 * 1024 * 1024
/** Techo del HTML de evidencia (se guarda como documento; más es ruido). */
export const MAX_BYTES_HTML = 2 * 1024 * 1024

export type ConfigFly = { token: string; app: string; imagen: string; apiUrl: string }

export function configFly(env: Record<string, string | undefined>): { ok: true; cfg: ConfigFly } | { ok: false; faltan: string[] } {
  const leer = (k: string) => (env[k] ?? '').trim()
  const faltan = ['FLY_API_TOKEN', 'TARIFICADOR_FLY_APP', 'TARIFICADOR_FLY_IMAGE', 'TARIFICADOR_API_URL'].filter((k) => !leer(k))
  if (faltan.length) return { ok: false, faltan }
  return {
    ok: true,
    cfg: { token: leer('FLY_API_TOKEN'), app: leer('TARIFICADOR_FLY_APP'), imagen: leer('TARIFICADOR_FLY_IMAGE'), apiUrl: leer('TARIFICADOR_API_URL') },
  }
}

/**
 * La petición a la API de Fly Machines que crea la máquina de UN trabajo. El `env` sale de la lista
 * blanca de `envDeMaquina` (JOB_ID + URL): ni DATABASE_URL, ni CODEOSCOPIC_*, ni el Bearer, ni
 * credenciales de portal (esas son fly secrets de la app del worker).
 */
export function peticionMaquina(cfg: ConfigFly, jobId: string): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
  const env = envDeMaquina({ jobId, apiUrl: cfg.apiUrl })
  const body = {
    name: `tarificar-${jobId.slice(0, 8)}`,
    region: REGION_FLY,
    config: {
      image: cfg.imagen,
      env,
      auto_destroy: true,
      restart: { policy: 'no' },
      guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 2048 },
      metadata: { trabajo: jobId, canal: 'rpa' },
    },
  }
  return {
    url: `https://api.machines.dev/v1/apps/${encodeURIComponent(cfg.app)}/machines`,
    init: { method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  }
}

// ─── El cuerpo del POST /api/tarificador/resultado ───────────────────────────

export type ResultadoWorker =
  | { tipo: 'ok'; trabajoId: string; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; contenido: Buffer }[] }
  | {
      tipo: 'error'
      trabajoId: string
      error: { tipo: TipoError; mensaje: string; url: string | null }
      captura: Buffer | null
      html: string | null
    }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

function base64(v: unknown, campo: string, errores: string[], max: number): Buffer | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v)) {
    errores.push(`${campo}: no es base64`)
    return null
  }
  const b = Buffer.from(v, 'base64')
  if (b.length === 0) errores.push(`${campo}: vacío`)
  else if (b.length > max) errores.push(`${campo}: ${b.length} bytes supera el techo de ${max}`)
  return b.length && b.length <= max ? b : null
}

const esPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-'
const esPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG'

export function leerResultadoWorker(entrada: unknown): { ok: true; r: ResultadoWorker } | { ok: false; errores: string[] } {
  const e = obj(entrada)
  if (!e) return { ok: false, errores: ['el cuerpo tiene que ser un objeto JSON'] }
  const trabajoId = typeof e.trabajoId === 'string' ? e.trabajoId.trim() : ''
  if (!UUID.test(trabajoId)) return { ok: false, errores: ['trabajoId no es un uuid'] }
  const errores: string[] = []

  if (e.resultado === 'ok') {
    const lista = Array.isArray(e.pdfs) ? e.pdfs : []
    if (lista.length > 10) return { ok: false, errores: ['más de 10 PDF en un resultado'] }
    const pdfs: { nombre: string; contenido: Buffer }[] = []
    lista.forEach((p, i) => {
      const o = obj(p)
      const b = base64(o?.base64, `pdfs[${i}].base64`, errores, MAX_BYTES_ADJUNTO)
      if (b && !esPdf(b)) errores.push(`pdfs[${i}]: no empieza por %PDF-`)
      const nombre = typeof o?.nombre === 'string' && o.nombre.trim() ? o.nombre.trim().slice(0, 120) : `oferta-${i + 1}.pdf`
      if (b) pdfs.push({ nombre, contenido: b })
    })
    const v = validarOfertas(e.ofertas, lista.length)
    if (!v.ok) errores.push(...v.errores)
    if (errores.length || !v.ok) return { ok: false, errores }
    return { ok: true, r: { tipo: 'ok', trabajoId, ofertas: v.ofertas, pdfs } }
  }

  if (e.resultado === 'error') {
    const err = obj(e.error)
    if (!esTipoError(err?.tipo)) errores.push('error.tipo desconocido')
    const mensaje = typeof err?.mensaje === 'string' && err.mensaje.trim() ? err.mensaje.trim().slice(0, 2000) : null
    if (!mensaje) errores.push('error.mensaje falta')
    const captura = base64(e.capturaBase64, 'capturaBase64', errores, MAX_BYTES_ADJUNTO)
    if (captura && !esPng(captura)) errores.push('capturaBase64: no es un PNG')
    const html = typeof e.html === 'string' && e.html !== '' ? e.html : null
    if (html && Buffer.byteLength(html, 'utf8') > MAX_BYTES_HTML) errores.push('html supera el techo')
    const url = typeof err?.url === 'string' ? err.url.slice(0, 500) : null
    if (errores.length) return { ok: false, errores }
    return { ok: true, r: { tipo: 'error', trabajoId, error: { tipo: err!.tipo as TipoError, mensaje: mensaje!, url }, captura, html } }
  }

  return { ok: false, errores: ['resultado tiene que ser «ok» o «error»'] }
}
