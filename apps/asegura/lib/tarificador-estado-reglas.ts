// Estado del TARIFICADOR (04/11/2026) — la parte PURA: de las filas agregadas del SQL (./tarificador-estado.ts) a lo que
// sale por `GET /api/operador/tarificador/estado`. Una fila por compañía × ramo con: último precio (fecha, canal, prima
// mínima), trabajos del bot ok/error en 7 y 30 días, último error REDACTADO y estado del bot. Aparte, el gasto Avant2
// (Codeoscopic) del mes, por ramo: una cotización de Avant2 pide precio a TODAS las compañías a la vez, así que su coste
// no se puede repartir por compañía sin inventarlo.
//
// 🔒 Del jsonb `error` solo sale: el TIPO (lista cerrada), el CÓDIGO de causa (lista cerrada, 05/11/2026), la CLAVE de atasco si es un identificador (`hueco_mapa`) y el
// ORIGEN + RUTA de la URL (sin query, sin fragmento, con los tramos que parecen datos cambiados por `:dato`). Nunca el
// `mensaje` (puede llevar matrícula, DNI o nombre), ni el HTML, ni la captura. `null` = «sin datos», nunca 0.
// El mensaje SOLO entra (recortado) en los trabajos anteriores al código, para DERIVARLO aquí (`codigoDeErrorJson`), y no sale.

import { CODIGOS_ERROR, codigoDeErrorJson, type CodigoError } from './tarificador-error-codigo.ts'

export const ESTADOS_BOT = ['activo', 'pilotaje', 'exploracion', 'sin_bot'] as const
export type EstadoBot = (typeof ESTADOS_BOT)[number]

/** Tipos de error que el worker escribe hoy. Cualquier otro sale como `otro` (no se repite un texto desconocido). */
export const TIPOS_ERROR = ['portal', 'datos', 'emision', 'eleccion', 'infra', 'captcha', 'credenciales'] as const
export type TipoError = (typeof TIPOS_ERROR)[number] | 'otro' | 'desconocido'

export type ErrorRedactado = {
  tipo: TipoError
  /** Causa (lista cerrada). `null` = el jsonb no permite saberla (nunca se inventa «otro»). */
  codigo: CodigoError | null
  /** Clave de atasco (`hueco_mapa`, `compania_anterior`…) solo si es un identificador; nunca un valor. */
  clave: string | null
  /** `https://www.e-pacallianz.com` — protocolo + host, nada más. */
  origen: string | null
  /** `/epac/cotizar/:dato` — ruta sin query ni fragmento, tramos con pinta de dato enmascarados. */
  ruta: string | null
}

const RE_CLAVE = /^[a-z][a-z0-9_]{0,59}$/
const MAX_TRAMOS = 8

/** Un tramo de ruta «parece un dato» si lleva 3+ cifras seguidas, una @, es muy largo, o es un uuid/hex largo. */
function tramoSeguro(t: string): string {
  let d = t
  try { d = decodeURIComponent(t) } catch { return ':dato' }
  if (d === '') return d
  if (/\d{3,}/.test(d) || d.includes('@') || d.length > 40 || /^[0-9a-f-]{16,}$/i.test(d) || /\s/.test(d)) return ':dato'
  if (!/^[A-Za-z0-9._~-]+$/.test(d)) return ':dato'
  return d
}

/** Origen y ruta de una URL del portal, sin query ni fragmento ni tramos con pinta de dato. URL ilegible → nulls. */
export function redactarUrl(u: unknown): { origen: string | null; ruta: string | null } {
  if (typeof u !== 'string' || u.trim() === '') return { origen: null, ruta: null }
  let url: URL
  try { url = new URL(u.trim()) } catch { return { origen: null, ruta: null } }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { origen: null, ruta: null }
  const origen = `${url.protocol}//${url.hostname}`
  const tramos = url.pathname.split('/').filter((t) => t !== '')
  const seguros = tramos.slice(0, MAX_TRAMOS).map(tramoSeguro)
  if (tramos.length > MAX_TRAMOS) seguros.push('…')
  return { origen, ruta: '/' + seguros.join('/') }
}

/** Del jsonb `error` del trabajo, SOLO tipo + clave + origen/ruta. `null` si no hay error. */
export function redactarError(e: unknown): ErrorRedactado | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null
  const o = e as Record<string, unknown>
  const t = o.tipo
  const tipo: TipoError = typeof t !== 'string' || t.trim() === '' ? 'desconocido' : (TIPOS_ERROR as readonly string[]).includes(t) ? (t as TipoError) : 'otro'
  const c = o.atascoClave
  const clave = typeof c === 'string' && RE_CLAVE.test(c) ? c : null
  return { tipo, codigo: codigoDeErrorJson(o), clave, ...redactarUrl(o.url) }
}

/** `Allianz`, ` MAPFRE ` → `allianz`, `mapfre`: la clave con la que se cruzan RPA y Avant2. */
export function claveCompania(s: unknown): string | null {
  if (typeof s !== 'string') return null
  const k = s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_')
  return k === '' ? null : k
}
const claveRamo = claveCompania

// ── Filas del SQL ────────────────────────────────────────────────────────────────────────────────────────────────
export type FilaPrecio = { compania: string | null; ramo: string | null; canal: string | null; creado_at: Date | string; prima: unknown }
export type FilaTrabajos = {
  compania: string; ramo: string
  ok_7d: unknown; error_7d: unknown; ok_30d: unknown; error_30d: unknown; tarificar_total: unknown
}
export type FilaUltimoError = { compania: string; ramo: string; modo: string | null; created_at: Date | string; error: unknown }
/** Exploración o pilotaje agrupado: `abiertas` sin cerrar y `recientes` de los últimos 30 días. */
export type FilaActividad = { compania: string | null; ramo: string | null; abiertas: unknown; recientes: unknown; ultima_at: Date | string | null }
export type FilaAvant2 = { ramo: string | null; cents: unknown; n: unknown }
/** Un error de TARIFICAR de los últimos 7 días: solo para contar su causa (el `error` trae tipo, código y, si no hay código, el mensaje). */
export type FilaCausa = { compania: string; ramo: string; error: unknown }

// ── Salida ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type Ventana = { ok: number; error: number }
export type CausaCuenta = { codigo: CodigoError; n: number }
export type FilaEstado = {
  compania: string
  ramo: string
  estadoBot: EstadoBot
  ultimoPrecio: { fecha: string; canal: 'rpa' | 'codeoscopic'; primaEur: number | null } | null
  d7: Ventana
  d30: Ventana
  ultimoError: (ErrorRedactado & { fecha: string; modo: string | null }) | null
  /** Errores de tarificar de 7 días por causa, de más a menos. `null` = no se pudo leer (≠ «ninguno», que es `[]`). */
  causas7d: CausaCuenta[] | null
}
export type Avant2Mes = { mes: string; totalEur: number; facturables: number; porRamo: { ramo: string; eur: number; n: number }[] }
export type Indicadores = {
  okBot7d: number
  errorBot7d: number
  /** % de trabajos del bot con precio en 7 días (ok / (ok+error)); null sin trabajos. */
  pctOk7d: number | null
  bots: Record<EstadoBot, number>
}

const num = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const numONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const iso = (d: Date | string): string => (d instanceof Date ? d : new Date(d)).toISOString()
const k2 = (c: string, r: string) => `${c}\u0000${r}`

/** `pelayo:presupuestos:auto` → compañía `pelayo`, ramo `auto` (el primer y el último tramo). */
export function parejaDeEntrada(entrada: unknown): { compania: string; ramo: string } | null {
  if (typeof entrada !== 'string') return null
  const t = entrada.split(':').map((x) => x.trim()).filter(Boolean)
  if (t.length < 2) return null
  const compania = claveCompania(t[0]), ramo = claveRamo(t[t.length - 1])
  return compania && ramo ? { compania, ramo } : null
}

/** Estado del bot: hay bot en producción (algún trabajo de TARIFICAR) > pilotaje > exploración > sin bot. */
export function estadoBot(x: { tarificarTotal: number; pilotaje: boolean; exploracion: boolean }): EstadoBot {
  if (x.tarificarTotal > 0) return 'activo'
  if (x.pilotaje) return 'pilotaje'
  if (x.exploracion) return 'exploracion'
  return 'sin_bot'
}

export type Entrada = {
  precios: FilaPrecio[]
  trabajos: FilaTrabajos[]
  errores: FilaUltimoError[]
  /** `null` = la tabla no existe o no se pudo leer (no «ninguna exploración»). */
  exploraciones: FilaActividad[] | null
  /** Errores de tarificar de 7 días (para agrupar por causa). Ausente/`null` = no se leyeron: `causas7d` queda `null`. */
  causas?: FilaCausa[] | null
  pilotajes: FilaActividad[] | null
}

const ORDEN: Record<EstadoBot, number> = { activo: 0, pilotaje: 1, exploracion: 2, sin_bot: 3 }

export function proyectarEstado(e: Entrada): FilaEstado[] {
  const filas = new Map<string, FilaEstado & { _tarificar: number; _pil: boolean; _exp: boolean }>()
  const fila = (cRaw: unknown, rRaw: unknown) => {
    const c = claveCompania(cRaw), r = claveRamo(rRaw)
    if (!c || !r) return null
    const k = k2(c, r)
    let f = filas.get(k)
    if (!f) {
      f = { compania: c, ramo: r, estadoBot: 'sin_bot', ultimoPrecio: null, d7: { ok: 0, error: 0 }, d30: { ok: 0, error: 0 }, ultimoError: null, causas7d: e.causas ? [] : null, _tarificar: 0, _pil: false, _exp: false }
      filas.set(k, f)
    }
    return f
  }

  for (const p of e.precios) {
    const canal = p.canal === 'rpa' || p.canal === 'codeoscopic' ? p.canal : null
    if (!canal) continue
    const f = fila(p.compania, p.ramo)
    if (!f) continue
    const fecha = iso(p.creado_at)
    if (!f.ultimoPrecio || fecha > f.ultimoPrecio.fecha) f.ultimoPrecio = { fecha, canal, primaEur: numONull(p.prima) }
  }
  for (const t of e.trabajos) {
    const f = fila(t.compania, t.ramo)
    if (!f) continue
    f.d7 = { ok: f.d7.ok + num(t.ok_7d), error: f.d7.error + num(t.error_7d) }
    f.d30 = { ok: f.d30.ok + num(t.ok_30d), error: f.d30.error + num(t.error_30d) }
    f._tarificar += num(t.tarificar_total)
  }
  for (const x of e.errores) {
    const f = fila(x.compania, x.ramo)
    if (!f) continue
    const red = redactarError(x.error)
    if (!red) continue
    const fecha = iso(x.created_at)
    if (!f.ultimoError || fecha > f.ultimoError.fecha) f.ultimoError = { ...red, fecha, modo: typeof x.modo === 'string' ? x.modo : null }
  }
  if (e.causas) {
    const cuentas = new Map<FilaEstado, Map<CodigoError, number>>()
    for (const x of e.causas) {
      const f = fila(x.compania, x.ramo)
      const codigo = f ? codigoDeErrorJson(x.error) : null
      if (!f || !codigo) continue
      const m = cuentas.get(f) ?? new Map<CodigoError, number>()
      m.set(codigo, (m.get(codigo) ?? 0) + 1)
      cuentas.set(f, m)
    }
    for (const [f, m] of cuentas) f.causas7d = ordenarCausas(m)
  }
  const actividad = (lista: FilaActividad[] | null, marca: '_pil' | '_exp') => {
    for (const a of lista ?? []) {
      if (num(a.abiertas) + num(a.recientes) === 0) continue
      const f = fila(a.compania, a.ramo)
      if (f) f[marca] = true
    }
  }
  actividad(e.pilotajes, '_pil')
  actividad(e.exploraciones, '_exp')

  return [...filas.values()]
    .map(({ _tarificar, _pil, _exp, ...f }) => ({ ...f, estadoBot: estadoBot({ tarificarTotal: _tarificar, pilotaje: _pil, exploracion: _exp }) }))
    .sort((a, b) => ORDEN[a.estadoBot] - ORDEN[b.estadoBot] || a.compania.localeCompare(b.compania) || a.ramo.localeCompare(b.ramo))
}

/** De más a menos; empate por el orden de la lista cerrada (estable). */
export function ordenarCausas(m: Map<CodigoError, number>): CausaCuenta[] {
  return [...m.entries()]
    .filter(([, n]) => n > 0)
    .map(([codigo, n]) => ({ codigo, n }))
    .sort((a, b) => b.n - a.n || CODIGOS_ERROR.indexOf(a.codigo) - CODIGOS_ERROR.indexOf(b.codigo))
}

/** La causa que más se repite (`null` = sin errores o sin leer). */
export function causaDominante(c: CausaCuenta[] | null): CausaCuenta | null {
  return c && c.length > 0 ? c[0]! : null
}

export function proyectarAvant2(mes: string, filas: FilaAvant2[]): Avant2Mes {
  const porRamo = filas
    .map((f) => ({ ramo: claveRamo(f.ramo) ?? 'sin_ramo', eur: Math.round(num(f.cents)) / 100, n: num(f.n) }))
    .filter((f) => f.n > 0 || f.eur > 0)
    .sort((a, b) => b.eur - a.eur || a.ramo.localeCompare(b.ramo))
  return {
    mes,
    totalEur: Math.round(porRamo.reduce((s, f) => s + f.eur * 100, 0)) / 100,
    facturables: porRamo.reduce((s, f) => s + f.n, 0),
    porRamo,
  }
}

export function indicadores(filas: FilaEstado[]): Indicadores {
  const okBot7d = filas.reduce((s, f) => s + f.d7.ok, 0)
  const errorBot7d = filas.reduce((s, f) => s + f.d7.error, 0)
  const total = okBot7d + errorBot7d
  const bots: Record<EstadoBot, number> = { activo: 0, pilotaje: 0, exploracion: 0, sin_bot: 0 }
  for (const f of filas) bots[f.estadoBot]++
  return { okBot7d, errorBot7d, pctOk7d: total > 0 ? Math.round((okBot7d / total) * 1000) / 10 : null, bots }
}
