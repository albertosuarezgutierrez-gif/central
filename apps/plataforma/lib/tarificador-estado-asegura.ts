// Estado del TARIFICADOR (04/11/2026) — PLATAFORMA. Lee `/api/operador/tarificador/estado` de asegura (agregados por
// compañía × ramo + gasto Avant2 del mes) y lo deja listo para pintar. PURO y con test: un fallo del puerto NO es «no hay
// bots», `null` = «sin datos» (nunca 0) y el error que llega ya redactado se vuelve a filtrar aquí (defensa en
// profundidad): solo tipo de una lista cerrada, clave identificador y origen + ruta sin query.

import { eur } from './dinero.ts'

export const ESTADOS_BOT = ['activo', 'pilotaje', 'exploracion', 'sin_bot'] as const
export type EstadoBot = (typeof ESTADOS_BOT)[number]
const TIPOS = ['portal', 'datos', 'emision', 'eleccion', 'infra', 'captcha', 'credenciales', 'otro', 'desconocido'] as const
export type TipoError = (typeof TIPOS)[number]

export type Ventana = { ok: number; error: number }
export type UltimoError = { tipo: TipoError; clave: string | null; origen: string | null; ruta: string | null; fecha: string; modo: string | null }
export type FilaEstado = {
  compania: string
  ramo: string
  estadoBot: EstadoBot
  ultimoPrecio: { fecha: string; canal: 'rpa' | 'codeoscopic'; primaEur: number | null } | null
  d7: Ventana | null
  d30: Ventana | null
  ultimoError: UltimoError | null
}
export type Avant2Mes = { mes: string; totalEur: number; facturables: number; porRamo: { ramo: string; eur: number; n: number }[] }
export type Indicadores = { okBot7d: number; errorBot7d: number; pctOk7d: number | null; bots: Record<EstadoBot, number> }

export type LecturaEstado =
  | { estado: 'ok'; filas: FilaEstado[]; indicadores: Indicadores; avant2: Avant2Mes | null; fuentesAusentes: string[]; generadoEn: string | null; ilegibles: number }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; causa: string }

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const entero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
const decimal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const fecha = (v: unknown): string | null => { const s = cadena(v); return s && !Number.isNaN(Date.parse(s)) ? s : null }

const RE_CLAVE = /^[a-z][a-z0-9_]{0,59}$/
const RE_ORIGEN = /^https?:\/\/[a-z0-9.-]+$/i
// Ruta ya redactada: tramos sin cifras largas, sin @, sin query/fragmento; si no, no se pinta.
const RE_RUTA = /^\/(?:(?::dato|…|[A-Za-z0-9._~-]{1,40})(?:\/|$))*$/

/** Filtro de defensa sobre el error que manda asegura: lo que no cumple la forma redactada se cae a `null`. */
export function errorSeguro(v: unknown): UltimoError | null {
  const o = obj(v)
  if (!o) return null
  const f = fecha(o.fecha)
  if (!f) return null
  const tipo = (TIPOS as readonly string[]).includes(o.tipo as string) ? (o.tipo as TipoError) : 'otro'
  const clave = typeof o.clave === 'string' && RE_CLAVE.test(o.clave) ? o.clave : null
  const origen = typeof o.origen === 'string' && RE_ORIGEN.test(o.origen) ? o.origen : null
  const ruta = typeof o.ruta === 'string' && RE_RUTA.test(o.ruta) && !/\d{3,}/.test(o.ruta) ? o.ruta : null
  const modo = cadena(o.modo)
  return { tipo, clave, origen, ruta, fecha: f, modo: modo && /^[a-z_]{1,20}$/.test(modo) ? modo : null }
}

const ventana = (v: unknown): Ventana | null => {
  const o = obj(v)
  const ok = entero(o?.ok), error = entero(o?.error)
  return ok === null || error === null ? null : { ok, error }
}

export function interpretarEstado(status: number, json: unknown): LecturaEstado {
  const o = obj(json) ?? {}
  if (status === 503 && o.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (status === 401 || status === 403) return { estado: 'error', causa: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET)' }
  if (status === 404) return { estado: 'error', causa: 'asegura aún no tiene /api/operador/tarificador/estado desplegado' }
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.filas)) return { estado: 'error', causa: cadena(o.causa) ?? `respuesta ilegible (HTTP ${status})` }

  const filas: FilaEstado[] = []
  let ilegibles = 0
  for (const f of o.filas) {
    const x = obj(f)
    const compania = cadena(x?.compania), ramo = cadena(x?.ramo)
    const estadoBot = (ESTADOS_BOT as readonly string[]).includes(x?.estadoBot as string) ? (x!.estadoBot as EstadoBot) : null
    if (!x || !compania || !ramo || !estadoBot) { ilegibles++; continue }
    const p = obj(x.ultimoPrecio)
    const pf = fecha(p?.fecha)
    const canal = p?.canal === 'rpa' || p?.canal === 'codeoscopic' ? p.canal : null
    filas.push({
      compania, ramo, estadoBot,
      ultimoPrecio: p && pf && canal ? { fecha: pf, canal, primaEur: decimal(p.primaEur) } : null,
      d7: ventana(x.d7), d30: ventana(x.d30),
      ultimoError: errorSeguro(x.ultimoError),
    })
  }

  // Indicadores: si faltan, se recalculan de las filas (nunca se inventa un 0 que no está).
  const i = obj(o.indicadores)
  const bots: Record<EstadoBot, number> = { activo: 0, pilotaje: 0, exploracion: 0, sin_bot: 0 }
  for (const f of filas) bots[f.estadoBot]++
  const okBot7d = entero(i?.okBot7d) ?? filas.reduce((s, f) => s + (f.d7?.ok ?? 0), 0)
  const errorBot7d = entero(i?.errorBot7d) ?? filas.reduce((s, f) => s + (f.d7?.error ?? 0), 0)
  const total = okBot7d + errorBot7d
  const indicadores: Indicadores = { okBot7d, errorBot7d, pctOk7d: total > 0 ? Math.round((okBot7d / total) * 1000) / 10 : null, bots }

  const a = obj(o.avant2)
  const totalEur = decimal(a?.totalEur)
  const avant2: Avant2Mes | null = a && totalEur !== null && cadena(a.mes)
    ? {
        mes: cadena(a.mes)!, totalEur, facturables: entero(a.facturables) ?? 0,
        porRamo: (Array.isArray(a.porRamo) ? a.porRamo : []).flatMap((r) => {
          const y = obj(r); const ramo = cadena(y?.ramo); const e = decimal(y?.eur); const n = entero(y?.n)
          return ramo && e !== null && n !== null ? [{ ramo, eur: e, n }] : []
        }),
      }
    : null

  const fuentesAusentes = Array.isArray(o.fuentesAusentes) ? o.fuentesAusentes.filter((s): s is string => typeof s === 'string') : []
  return { estado: 'ok', filas, indicadores, avant2, fuentesAusentes, generadoEn: cadena(o.generadoEn), ilegibles }
}

export const ETIQUETA_ESTADO_BOT: Record<EstadoBot, { texto: string; tono: 'positivo' | 'aviso' | 'info' | 'neutral'; ayuda: string }> = {
  activo: { texto: 'Activo', tono: 'positivo', ayuda: 'El bot ya tarifica en producción para esta compañía y ramo' },
  pilotaje: { texto: 'En pilotaje', tono: 'aviso', ayuda: 'Se está enseñando al bot a mano (pilotaje abierto o en los últimos 30 días)' },
  exploracion: { texto: 'En exploración', tono: 'info', ayuda: 'El explorador está mapeando el portal (abierta o en los últimos 30 días)' },
  sin_bot: { texto: 'Sin bot', tono: 'neutral', ayuda: 'No hay bot: el precio, si lo hay, llega por Avant2 (Codeoscopic)' },
}

export const ETIQUETA_TIPO_ERROR: Record<TipoError, string> = {
  portal: 'Fallo del portal', datos: 'Faltan o no cuadran datos', emision: 'Emisión', eleccion: 'Pide elegir una opción',
  infra: 'Infraestructura', captcha: 'Captcha', credenciales: 'Credenciales', otro: 'Otro', desconocido: 'Sin tipo',
}

export const ETIQUETA_CANAL: Record<'rpa' | 'codeoscopic', string> = { rpa: 'Bot (RPA)', codeoscopic: 'Avant2' }

/** Nombre legible de la clave interna: `mapfre` → «Mapfre», `mutua_madrilena` → «Mutua madrilena». */
export function nombreClave(s: string): string {
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Prima con `eur()`; sin dato → «—» (nunca 0,00€). */
export function textoPrima(n: number | null): string {
  return n === null ? '—' : eur(n)
}

/** «62,5 %»; null → «sin datos». */
export function textoPct(p: number | null): string {
  return p === null ? 'sin datos' : `${p.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`
}

/** `2026-11` → «noviembre de 2026». */
export function textoMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes)
  if (!m) return mes
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}
