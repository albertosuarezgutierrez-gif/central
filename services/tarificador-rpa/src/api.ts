// Cliente HTTP del worker hacia apps/asegura. El ÚNICO canal del worker con la casa: sin BD.

import type { OfertaNormalizada, PasoTraza, TipoError } from '@central/module-tarificacion'

export type Config = { jobId: string; apiUrl: string; secreto: string }

export function leerConfig(env: Record<string, string | undefined>): Config {
  const jobId = (env.JOB_ID ?? '').trim()
  const apiUrl = (env.TARIFICADOR_API_URL ?? '').trim()
  const secreto = env.TARIFICADOR_WORKER_SECRET ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('JOB_ID ausente o no es un uuid')
  if (!/^https:\/\//.test(apiUrl)) throw new Error('TARIFICADOR_API_URL ausente o no es https')
  // Sin fallback: sin secreto no se habla con nadie.
  if (secreto.length < 16) throw new Error('TARIFICADOR_WORKER_SECRET ausente (fly secret)')
  return { jobId, apiUrl: apiUrl.replace(/\/+$/, ''), secreto }
}

/**
 * EMISIÓN (10/10/2026): `preparar` = llegar a la pantalla previa SIN pulsar y devolver la prima; `ejecutar` = Alberto
 * autorizó: el token (de un solo uso, entregado UNA vez) se canjea justo antes del único clic. 🚨 El token no se loguea.
 */
export type EmisionTrabajo = { fase: 'preparar' } | { fase: 'ejecutar'; token: string; primaCents: number }

/** `leaseHasta` (ISO): hasta cuándo asegura acepta el resultado; el runner no reintenta si no cabe. */
export type Trabajo = { id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta?: string; modo?: 'tarificar' | 'emision'; emision?: EmisionTrabajo }

const ESPERAS_PEDIR_MS = [2_000, 4_000, 8_000]
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Hasta 4 intentos (esperas 2 s, 4 s, 8 s) ante excepción de red (fetch lanza/aborta) o HTTP 5xx salvo 503
 * (503 = RPA apagado; 401/403/404 = definitivos). Agotados: tras excepción, RELANZA la última (el runner registra
 * el motivo); tras 5xx, devuelve ese status. `esperar` es inyectable para los tests.
 */
export async function pedirTrabajo(
  c: Config,
  esperar: (ms: number) => Promise<void> = dormir,
): Promise<{ estado: 'ok'; trabajo: Trabajo } | { estado: 'no_disponible'; status: number }> {
  const intentos = ESPERAS_PEDIR_MS.length + 1
  for (let i = 0; ; i++) {
    const ultimo = i === intentos - 1
    let res: Response
    try {
      res = await fetch(`${c.apiUrl}/api/tarificador/trabajo/${encodeURIComponent(c.jobId)}`, {
        headers: { Authorization: `Bearer ${c.secreto}` },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      if (ultimo) throw e
      await esperar(ESPERAS_PEDIR_MS[i])
      continue
    }
    if (res.status >= 500 && res.status !== 503 && !ultimo) {
      await esperar(ESPERAS_PEDIR_MS[i])
      continue
    }
    if (!res.ok) return { estado: 'no_disponible', status: res.status }
    const j = (await res.json()) as { trabajo?: Trabajo }
    if (!j.trabajo) return { estado: 'no_disponible', status: res.status }
    return { estado: 'ok', trabajo: j.trabajo }
  }
}

/**
 * Salida del worker cuando no hay trabajo. 404/503 (y 4xx) = nada que hacer (0). Red agotada (status 0) o 5xx
 * persistente = INFRA: se loguea el motivo (redactado, sin URL ni cabeceras), se avisa a asegura para que el
 * orquestador reintente y se sale con 1 (también si el aviso falla).
 */
export async function salidaSinTrabajo(
  cfg: Config,
  t: { status: number; e?: unknown },
  log: (mensaje: string, datos?: Record<string, unknown>) => void,
  redactar: (t: string) => string,
  enviar: (c: Config, cuerpo: CuerpoResultado) => Promise<number> = enviarResultado,
): Promise<number> {
  const err = t.e as { message?: unknown; cause?: { code?: unknown } } | undefined
  const infra = t.status === 0 || (t.status >= 500 && t.status !== 503)
  if (!infra) {
    log('trabajo_no_disponible', { status: t.status })
    return 0
  }
  const motivo = redactar(String(err?.message ?? (t.status ? `HTTP ${t.status}` : 'sin respuesta'))).slice(0, 200)
  log('trabajo_no_disponible', { status: t.status, motivo, codigo: err?.cause?.code })
  const enviado = await enviar(cfg, {
    trabajoId: cfg.jobId,
    resultado: 'error',
    error: { tipo: 'infra', mensaje: `no se pudo pedir el trabajo (status ${t.status}): ${motivo}`, url: null },
  }).catch(() => 0)
  if (enviado === 0 || enviado >= 500) log('aviso_infra_fallido', { status: enviado })
  return 1
}

/** Traza (pasos con tiempos y códigos, sin datos personales) y versión del adaptador; viajan en el MISMO POST del resultado. */
export type MetaTraza = { pasos?: PasoTraza[]; botVersion?: string }

export type CuerpoResultado =
  | ({ trabajoId: string; resultado: 'ok'; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[] } & MetaTraza)
  | ({ trabajoId: string; resultado: 'error'; error: { tipo: TipoError; mensaje: string; url: string | null }; capturaBase64?: string; html?: string } & MetaTraza)

/** Hasta 3 intentos ante red caída o 5xx (un 409 = ya registrado o lease vencido: no se insiste). */
export async function enviarResultado(c: Config, cuerpo: CuerpoResultado): Promise<number> {
  let ultimo = 0
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${c.apiUrl}/api/tarificador/resultado`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(30_000),
      })
      ultimo = res.status
      if (res.status < 500) return res.status
    } catch {
      ultimo = 0
    }
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)))
  }
  return ultimo
}

// ─── Emisión (10/10/2026) ────────────────────────────────────────────────────

export type RespuestaCanje = { ok: true; hashDatos: string; boton: { id: string; texto: string } } | { ok: false; motivo: string }

/** UN intento (nunca se reintenta un canje: el token se consume en el primero). El token va en el cuerpo, no en la URL. */
export async function canjearToken(c: Config, e: { trabajoId: string; token: string; primaCents: number }): Promise<RespuestaCanje> {
  try {
    const res = await fetch(`${c.apiUrl}/api/tarificador/emision/canje`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(e),
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await res.json().catch(() => null)) as { ok?: unknown; hashDatos?: unknown; boton?: { id?: unknown; texto?: unknown }; motivo?: unknown } | null
    if (res.status === 200 && j?.ok === true && typeof j.hashDatos === 'string' && typeof j.boton?.id === 'string' && typeof j.boton?.texto === 'string') {
      return { ok: true, hashDatos: j.hashDatos, boton: { id: j.boton.id, texto: j.boton.texto } }
    }
    return { ok: false, motivo: typeof j?.motivo === 'string' ? j.motivo.slice(0, 120) : `HTTP ${res.status}` }
  } catch {
    // Sin respuesta legible = no hay canje (fail-closed): no se pulsa.
    return { ok: false, motivo: 'canje sin respuesta' }
  }
}

export type CuerpoEmision =
  | { trabajoId: string; resultado: 'pre_emision'; primaCents: number; capturaBase64?: string }
  | { trabajoId: string; resultado: 'emitida'; numeroPoliza: string | null; capturaBase64?: string }
  | { trabajoId: string; resultado: 'incierto' | 'no_emitida'; motivo: string; capturaBase64?: string }

/** Hasta 3 intentos ante red caída o 5xx (el registro es idempotente: un segundo llega con 409). */
export async function enviarResultadoEmision(c: Config, cuerpo: CuerpoEmision): Promise<number> {
  let ultimo = 0
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${c.apiUrl}/api/tarificador/emision/resultado`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(30_000),
      })
      ultimo = res.status
      if (res.status < 500) return res.status
    } catch {
      ultimo = 0
    }
    await new Promise((r) => setTimeout(r, 2_000 * (i + 1)))
  }
  return ultimo
}
