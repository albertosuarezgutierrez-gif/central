// lib/seo-correduria/gsc-consulta.ts — consulta AD-HOC a Google Search Console.
//
// El cron de los lunes (`gsc.ts`) lee siempre lo mismo: 7 días cerrados, dimensión `query` y
// `page`, propiedad de la correduría. Esto es lo otro: preguntar por un rango y unas dimensiones
// cualesquiera, y saber a qué propiedades llega de verdad la cuenta de servicio. Misma credencial
// (`GSC_SA_CLIENT_EMAIL`/`GSC_SA_PRIVATE_KEY`) y mismo scope de solo lectura — sin secreto nuevo.
//
// 🚨 Los últimos ~3 días de GSC vienen INCOMPLETOS: la API responde 200 con menos clics de los
// reales, que aguas arriba se leen como «una bajada». Por eso una ventana que los toque sale
// marcada `parcial: true` con el último día fiable, en vez de devolver el número a secas. Es la
// regla «dato que NO hay ≠ dato que NO se ha mirado» de CLAUDE.md: aquí el disfraz del «no lo sé»
// es un número plausible, no un NULL.
//
// `fetch` se inyecta (FetchLike) para que los tests no toquen la red.

import { GSC_API_BASE } from './gsc.ts'
import { PROPIEDAD_GSC, type FetchLike } from './tipos.ts'

/** Dimensiones que acepta Search Analytics. `searchAppearance` no combina con las demás (la API la rechaza). */
export const DIMENSIONES = ['query', 'page', 'country', 'device', 'date', 'searchAppearance'] as const
export type Dimension = (typeof DIMENSIONES)[number]

/** Tope duro de la API por petición. */
export const LIMITE_MAXIMO = 25_000
export const LIMITE_DEFECTO = 100
/** Días que GSC tarda en consolidar. Ver cabecera. */
export const DIAS_LATENCIA = 3
/** Ventana por defecto cuando no se pide uno: 28 días cerrados el último día fiable. */
export const DIAS_DEFECTO = 28

const DIA_MS = 86_400_000
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export type Consulta = {
  propiedad: string
  desde: string
  hasta: string
  dimensiones: Dimension[]
  limite: number
}

export type FilaLibre = {
  /** Una entrada por dimensión pedida, en el mismo orden. Sin dimensiones → `[]` (fila total). */
  claves: string[]
  clics: number
  impresiones: number
  ctr: number
  posicion: number
}

export type Sitio = { propiedad: string; permiso: string }

/** 'YYYY-MM-DD' en UTC. */
function fechaUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Último día que GSC da por consolidado: hoy − DIAS_LATENCIA (UTC). */
export function ultimoDiaFiable(hoy: Date): string {
  const medianoche = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return fechaUtc(medianoche - DIAS_LATENCIA * DIA_MS)
}

/** Una fecha 'YYYY-MM-DD' que además EXISTE (descarta 2026-02-31, que `new Date` acepta y desplaza). */
function fechaValida(s: string): boolean {
  if (!FECHA_RE.test(s)) return false
  const ms = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(ms) && fechaUtc(ms) === s
}

export type Parseo = { ok: true; consulta: Consulta } | { ok: false; error: string }

/**
 * Valida el cuerpo de la petición y rellena los huecos. Puro: ni red ni `Date.now()` —
 * `hoy` entra por parámetro para que el test fije la ventana por defecto.
 *
 * Rechazar en vez de corregir en silencio es deliberado: una dimensión mal escrita corregida a
 * `query` devolvería 200 con datos que no son los que se han pedido.
 */
export function parsearConsulta(body: unknown, hoy: Date): Parseo {
  // Un cuerpo que no es un objeto (una lista, un número, una cadena) NO se degrada a los valores
  // por defecto: devolvería 200 con los últimos 28 días y el caller creería estar viendo lo que
  // pidió. Ausente (`null`/`undefined`) sí significa «dame el defecto», y eso se dice aquí.
  if (body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) {
    return { ok: false, error: 'el cuerpo debe ser un objeto JSON' }
  }
  const b = (body ?? {}) as Record<string, unknown>

  const propiedad = typeof b.propiedad === 'string' && b.propiedad.trim() ? b.propiedad.trim() : PROPIEDAD_GSC

  const hasta = b.hasta === undefined || b.hasta === null ? ultimoDiaFiable(hoy) : b.hasta
  if (typeof hasta !== 'string' || !fechaValida(hasta)) return { ok: false, error: '`hasta` debe ser una fecha YYYY-MM-DD válida' }

  const desde =
    b.desde === undefined || b.desde === null
      ? fechaUtc(Date.parse(`${hasta}T00:00:00Z`) - (DIAS_DEFECTO - 1) * DIA_MS)
      : b.desde
  if (typeof desde !== 'string' || !fechaValida(desde)) return { ok: false, error: '`desde` debe ser una fecha YYYY-MM-DD válida' }
  if (desde > hasta) return { ok: false, error: '`desde` no puede ser posterior a `hasta`' }

  const crudas = b.dimensiones === undefined || b.dimensiones === null ? ['query'] : b.dimensiones
  if (!Array.isArray(crudas)) return { ok: false, error: '`dimensiones` debe ser una lista' }
  const dimensiones: Dimension[] = []
  for (const d of crudas) {
    if (typeof d !== 'string' || !(DIMENSIONES as readonly string[]).includes(d)) {
      return { ok: false, error: `dimensión no soportada: ${JSON.stringify(d)} (válidas: ${DIMENSIONES.join(', ')})` }
    }
    if (dimensiones.includes(d as Dimension)) return { ok: false, error: `dimensión repetida: ${d}` }
    dimensiones.push(d as Dimension)
  }
  // La API responde 400 si `searchAppearance` viaja con otra dimensión; se dice aquí, con su motivo.
  if (dimensiones.includes('searchAppearance') && dimensiones.length > 1) {
    return { ok: false, error: '`searchAppearance` no se puede combinar con otras dimensiones (lo rechaza la API de Google)' }
  }

  const limite = b.limite === undefined || b.limite === null ? LIMITE_DEFECTO : b.limite
  if (!Number.isInteger(limite) || (limite as number) < 1 || (limite as number) > LIMITE_MAXIMO) {
    return { ok: false, error: `\`limite\` debe ser un entero entre 1 y ${LIMITE_MAXIMO}` }
  }

  return { ok: true, consulta: { propiedad, desde, hasta, dimensiones, limite: limite as number } }
}

/**
 * ¿La ventana pedida toca días que GSC todavía no ha consolidado? Si sí, los totales son un
 * SUELO, no el dato: quien lo pinte tiene que decirlo.
 */
export function esParcial(consulta: Pick<Consulta, 'hasta'>, hoy: Date): boolean {
  return consulta.hasta > ultimoDiaFiable(hoy)
}

type FilaApi = { keys?: unknown[]; clicks?: number; impressions?: number; ctr?: number; position?: number }

/** Una consulta a searchAnalytics/query con rango y dimensiones libres. Sin `rows` → `[]`. */
export async function consultarLibre(token: string, consulta: Consulta, fetch: FetchLike): Promise<FilaLibre[]> {
  const url = `${GSC_API_BASE}/${encodeURIComponent(consulta.propiedad)}/searchAnalytics/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: consulta.desde,
      endDate: consulta.hasta,
      dimensions: consulta.dimensiones,
      rowLimit: consulta.limite,
    }),
  })
  const cuerpo = await res.text()
  if (!res.ok) throw new Error(`gsc consulta ${res.status}: ${cuerpo.slice(0, 200)}`)

  const json = JSON.parse(cuerpo) as { rows?: FilaApi[] }
  if (!Array.isArray(json.rows)) return []
  return json.rows.map(r => ({
    claves: Array.isArray(r.keys) ? r.keys.map(k => String(k)) : [],
    clics: Number(r.clicks ?? 0),
    impresiones: Number(r.impressions ?? 0),
    ctr: Number(r.ctr ?? 0),
    posicion: Number(r.position ?? 0),
  }))
}

/**
 * Propiedades a las que llega la cuenta de servicio (`sites.list`). Responder «no hay datos» sin
 * mirar esto es el fallo caro: una propiedad a la que la cuenta no ha sido invitada devuelve 403,
 * y un dominio escrito sin el prefijo `sc-domain:` no es la misma propiedad que con él.
 */
export async function listarSitios(token: string, fetch: FetchLike): Promise<Sitio[]> {
  const res = await fetch(GSC_API_BASE, { headers: { Authorization: `Bearer ${token}` } })
  const cuerpo = await res.text()
  if (!res.ok) throw new Error(`gsc sitios ${res.status}: ${cuerpo.slice(0, 200)}`)

  const json = JSON.parse(cuerpo) as { siteEntry?: { siteUrl?: unknown; permissionLevel?: unknown }[] }
  if (!Array.isArray(json.siteEntry)) return []
  return json.siteEntry.map(s => ({
    propiedad: String(s.siteUrl ?? ''),
    permiso: String(s.permissionLevel ?? 'desconocido'),
  }))
}
