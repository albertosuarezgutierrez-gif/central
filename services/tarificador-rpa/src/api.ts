// Cliente HTTP del worker hacia apps/asegura. El ÚNICO canal del worker con la casa: sin BD.

import type { AtascoWorker, CandidatoVersion, IncidenciaEjecucion, InventarioDom, OfertaNormalizada, OpcionPoblacion, PasoTraza, Recorrido, ResultadoAdaptador, SeleccionVehiculo, TipoError, VehiculoConfirmado } from '@central/module-tarificacion'

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

/**
 * EXPLORACIÓN (13/10/2026): la entrada (clave de `ENTRADAS_EXPLORACION`) y si va ligada a una petición REAL del mismo
 * cliente (entonces lo personal sale del `riesgo`; si no, sintético y se para si piden NIF). Lo decide asegura.
 */
export type ExploracionTrabajo = { entrada: string; conDatosReales: boolean }

/** `leaseHasta` (ISO): hasta cuándo asegura acepta el resultado; el runner no reintenta si no cabe. */
export type Trabajo = {
  id: string; compania: string; ramo: string; riesgo: unknown; leaseHasta?: string
  modo?: 'tarificar' | 'emision' | 'exploracion' | 'humo'; emision?: EmisionTrabajo; exploracion?: ExploracionTrabajo
}

/**
 * Modos que ESTA imagen sabe ejecutar. Viajan en la cabecera `X-Tarificador-Modos` al pedir el trabajo: asegura solo
 * sirve un trabajo de exploración a un worker que lo declara (una imagen vieja lo trataría como `tarificar`).
 */
export const MODOS_SOPORTADOS = ['tarificar', 'emision', 'exploracion', 'humo'] as const
export const CABECERA_MODOS = 'X-Tarificador-Modos'

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
        headers: { Authorization: `Bearer ${c.secreto}`, [CABECERA_MODOS]: MODOS_SOPORTADOS.join(',') },
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

/**
 * Vehículo de catálogo que el bot dejó confirmado en su portal (18/10/2026), solo en un `ok`: `vehiculoConfirmado` (Mapfre:
 * denominación, CV, CC…) y/o `seleccionVehiculo` (marca, modelo y versión separados). SIN matrícula ni bastidor. Asegura lo
 * valida otra vez y lo encadena al bot de Generali de la misma oportunidad (Generali no busca por matrícula).
 */
export type VehiculoDelResultado = { vehiculoConfirmado?: VehiculoConfirmado; seleccionVehiculo?: Pick<SeleccionVehiculo, 'marca' | 'modelo' | 'descripcion'> }

/** Lo que del resultado del adaptador viaja como vehículo confirmado (solo lo que trae; `null`/vacío no viaja). PURA. */
export function vehiculoDelResultado(r: Pick<ResultadoAdaptador, 'vehiculoConfirmado' | 'seleccionVehiculo'>): VehiculoDelResultado {
  const out: VehiculoDelResultado = {}
  if (r.vehiculoConfirmado) out.vehiculoConfirmado = r.vehiculoConfirmado
  const sv = r.seleccionVehiculo
  if (sv && sv.marca?.trim() && sv.modelo?.trim()) {
    out.seleccionVehiculo = { marca: sv.marca.trim(), modelo: sv.modelo.trim(), ...(sv.descripcion?.trim() ? { descripcion: sv.descripcion.trim() } : {}) }
  }
  return out
}

export type CuerpoResultado =
  | ({ trabajoId: string; resultado: 'ok'; ofertas: OfertaNormalizada[]; pdfs: { nombre: string; base64: string }[] } & VehiculoDelResultado & MetaTraza)
  | ({ trabajoId: string; resultado: 'error'; error: { tipo: TipoError; mensaje: string; url: string | null; opcionesVersion?: CandidatoVersion[]; opcionesPoblacion?: OpcionPoblacion[]; inventarioDom?: InventarioDom; recorrido?: Recorrido; atasco?: AtascoWorker }; capturaBase64?: string; html?: string } & MetaTraza)
  /** Exploración terminada (13/10/2026): el MAPA ya lo construyó asegura en `/explorador/cierre`; aquí solo el desenlace. */
  | ({ trabajoId: string; resultado: 'explorado'; motivoFin: string; presupuesto?: CuerpoResultadoPresupuesto } & MetaTraza)
  /** Prueba nocturna de humo superada (15/10/2026, src/humo.ts): login y pantalla de inicio alcanzados. Un fallo va como `error`. */
  | ({ trabajoId: string; resultado: 'humo'; omitido?: string; ramoProbado?: string; ramosConBot?: string[] } & MetaTraza)

/** Presupuesto guardado por el explorador (14/10/2026): referencia del portal (`null` = no se vio) y su PDF si llegó. */
export type CuerpoResultadoPresupuesto = { referencia: string | null; pdf: { nombre: string; base64: string } | null }

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

// ─── Explorador IA (13/10/2026) ──────────────────────────────────────────────

export type RespuestaPaso =
  /** `respuesta` sin validar: el worker la REVALIDA contra su propio inventario antes de tocar nada. */
  | { estado: 'ok'; respuesta: unknown; leaseHasta: string | null }
  /** asegura dijo «para» (503 con su `parar`, explorador apagado, error): se cierra la exploración. */
  | { estado: 'parar'; status: number; respuesta: unknown }
  /** 404: la exploración ya no está en curso (lease vencido, cancelada). Se sale sin resultado. */
  | { estado: 'perdido'; status: number }

/**
 * `POST /api/tarificador/explorador/paso`. Sin reintento ciego (cada paso puede costar una llamada de IA): solo un 409
 * `paso_en_curso` se reintenta UNA vez tras `esperaMs`. Red caída = `parar`.
 */
export async function pedirPaso(
  c: Config,
  cuerpo: { trabajoId: string; inventario: InventarioDom; avancesFallidos: number; incidencias?: IncidenciaEjecucion[]; vistaAria?: string; fase?: 'login' },
  esperar: (ms: number) => Promise<void> = dormir,
  esperaMs = 5_000,
): Promise<RespuestaPaso> {
  for (let i = 0; i < 2; i++) {
    let res: Response
    try {
      res = await fetch(`${c.apiUrl}/api/tarificador/explorador/paso`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(75_000),
      })
    } catch {
      return { estado: 'parar', status: 0, respuesta: null }
    }
    const j = (await res.json().catch(() => null)) as { respuesta?: unknown; leaseHasta?: unknown } | null
    if (res.status === 200) return { estado: 'ok', respuesta: j?.respuesta ?? null, leaseHasta: typeof j?.leaseHasta === 'string' ? j.leaseHasta : null }
    if (res.status === 404) return { estado: 'perdido', status: 404 }
    if (res.status === 409 && i === 0) {
      await esperar(esperaMs)
      continue
    }
    return { estado: 'parar', status: res.status, respuesta: j?.respuesta ?? null }
  }
  return { estado: 'parar', status: 409, respuesta: null }
}

/** `detalleFin` (opcional, 14/10/2026): código de `DETALLES_FIN_EXPLORACION`; un asegura anterior lo ignora. */
export type CuerpoCierre = {
  trabajoId: string
  motivoFin: string
  detalleFin?: string
  /** Incidencias de ejecución del último lote (14/10/2026): asegura las anota en los `errores` del último paso. */
  incidencias?: IncidenciaEjecucion[]
  redNoGet: string[]
  efectosEnPortal: string[]
  /** Guardado del presupuesto (14/10/2026) → `mapa.presupuesto`. */
  presupuesto?: { guardado: boolean; referencia: string | null; pdf: boolean | null }
}

/** `POST /api/tarificador/explorador/cierre`: hasta 3 intentos ante red caída, 5xx o 409 «paso en curso». */
export async function cerrarExploracion(c: Config, cuerpo: CuerpoCierre, esperar: (ms: number) => Promise<void> = dormir): Promise<number> {
  let ultimo = 0
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${c.apiUrl}/api/tarificador/explorador/cierre`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.secreto}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(30_000),
      })
      const ocupado = res.status === 409 && ((await res.json().catch(() => null)) as { motivo?: unknown } | null)?.motivo === 'paso_en_curso'
      // Ocupado tras los reintentos = NO cerrada (0): un 409 final no debe confundirse con «ya estaba cerrada».
      ultimo = ocupado ? 0 : res.status
      if (res.status < 500 && !ocupado) return res.status
    } catch {
      ultimo = 0
    }
    await esperar(2_000 * (i + 1))
  }
  return ultimo
}
