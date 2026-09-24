// Informe anual de mediación (base de la documentación estadístico-contable a la DGSFP).
//
// Junta dos fuentes: lo que sirve asegura por el puerto (primas del año por compañía y ramo según
// CIMA, pólizas en vigor hoy, quejas del SAC) y el libro de comisiones de esta app
// (`comisiones_devengo`). NO es el modelo oficial: es la hoja de trabajo para rellenarlo, y dice
// qué le falta en vez de dar totales que parecen completos.
//
//   1. Lo PURO (lectura del puerto, filas de comisiones, CSV) lo importa el client component y lo
//      prueba `test/regression-informe-mediacion.test.ts`.
//   2. La RED (`informeMediacionAsegura`), solo desde la ruta API.
import { cabecerasPuerto } from './puerto-actor.ts'

export type FilaPrimas = {
  compania: string | null
  ramo: string | null
  recibos: number
  primas: number
  primasNuevaProduccion: number
  primasCartera: number
  primasOtras: number
  anulados: number
  devueltos: number
  pendientes: number
  /** Ausente en un asegura anterior: se lee como 0 (no había contador). */
  sinSituacion?: number
}

export type InformePuerto = {
  primas: {
    año: number
    filas: FilaPrimas[]
    total: { recibos: number; primas: number; primasNuevaProduccion: number; primasCartera: number; primasOtras: number }
    ilegibles: number
    sinFecha: number
    companiasConDatos: string[]
  }
  companias: Record<string, string>
  carteraHoy: { compania: string | null; ramo: string | null; polizas: number }[]
  quejas: { total: number; abiertas: number; cerradasEnPlazo: number; cerradasFueraDePlazo: number }
}

export type LecturaInforme =
  | { estado: 'ok'; informe: InformePuerto }
  | { estado: 'sin_configurar' }
  | { estado: 'no_desplegado' }
  | { estado: 'error'; motivo: string }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Valida la forma entera: una respuesta a medias NO se pinta (daría totales falsos). */
export function interpretarInforme(status: number, json: unknown): LecturaInforme {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = (typeof json === 'object' && json !== null ? json : {}) as Record<string, unknown>
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404) return { estado: 'no_desplegado' }
  if (status !== 200 || o.estado !== 'ok') {
    return { estado: 'error', motivo: String(o.causa ?? o.motivo ?? `HTTP ${status}`) }
  }
  const p = o.primas as Record<string, unknown> | undefined
  const t = p?.total as Record<string, unknown> | undefined
  const q = o.quejas as Record<string, unknown> | undefined
  const fila = (f: unknown) => {
    const x = (f ?? {}) as Record<string, unknown>
    return ['recibos', 'primas', 'primasNuevaProduccion', 'primasCartera', 'primasOtras', 'anulados', 'devueltos', 'pendientes'].every((k) => num(x[k]))
  }
  const cartera = (c: unknown) => num(((c ?? {}) as Record<string, unknown>).polizas)
  const forma =
    p && Array.isArray(p.filas) && p.filas.every(fila) && t &&
    ['recibos', 'primas', 'primasNuevaProduccion', 'primasCartera', 'primasOtras'].every((k) => num(t[k])) &&
    num(p.ilegibles) && num(p.sinFecha) && Array.isArray(p.companiasConDatos) &&
    Array.isArray(o.carteraHoy) && o.carteraHoy.every(cartera) && typeof o.companias === 'object' && o.companias !== null &&
    q && num(q.total) && num(q.abiertas) && num(q.cerradasEnPlazo) && num(q.cerradasFueraDePlazo)
  if (!forma) return { estado: 'error', motivo: 'respuesta_ilegible' }
  return { estado: 'ok', informe: o as unknown as InformePuerto }
}

/** Comisiones del año por compañía, desde el libro. `null` en un importe = ningún periodo con extracto. */
export type ComisionCompania = {
  /** Código DGS: la identidad por la que se agrupa. */
  codigo: string
  /** Etiqueta del libro, para pintar. */
  compania: string
  bruto: number | null
  retencion: number | null
  periodos: number
  /** Sin extracto de la compañía: su bruto NO está en el total. */
  periodosSinExtracto: number
  /** La última pasada del cron no pudo leer el libro (`leido_ok=false`): importes posiblemente viejos, fuera del total. */
  periodosSinComprobar: number
  /** Con bruto pero sin retención informada: la retención de la fila se queda corta. */
  periodosSinRetencion: number
}

/** Nombre legible de un código DGS; el código tal cual si no hay nombre. */
export function nombreCompania(codigo: string | null, nombres: Record<string, string>): string {
  if (!codigo) return 'Sin compañía'
  return nombres[codigo] ?? codigo
}

/**
 * Compañías con pólizas en vigor HOY de las que CIMA no ha mandado ni un recibo del año: sus primas no
 * son 0, no se saben. Se compara con la cartera de hoy (la de 31/12 no se reconstruye): en un año pasado
 * puede señalar una compañía que entró después, y la UI lo dice.
 */
export function companiasSinPrimas(i: InformePuerto): string[] {
  const con = new Set(i.primas.companiasConDatos)
  return [...new Set(i.carteraHoy.map((c) => c.compania).filter((c): c is string => !!c && !con.has(c)))].sort()
}

const celda = (v: string | number | null) => {
  if (v === null) return ''
  if (typeof v === 'number') return v.toFixed(2).replace('.', ',')
  // Un texto que Excel leería como fórmula (=, +, -, @, tabulador) se neutraliza con un apóstrofo.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV (separador `;`, decimales con coma: lo abre Excel en español sin tocar nada). La primera línea
 * dice qué es y qué NO es, para que el fichero no viaje sin su advertencia.
 */
export function csvInforme(i: InformePuerto, comisiones: ComisionCompania[] | null): string {
  const n = (c: string | null) => nombreCompania(c, i.companias)
  const l: string[] = []
  l.push(celda(`Borrador informe anual de mediación ${i.primas.año} — hoja de trabajo, NO es el modelo oficial de la DGSFP`))
  l.push('')
  l.push('PRIMAS COBRADAS SEGÚN CIMA (prima total, con impuestos);Compañía;Ramo;Recibos;Primas;Nueva producción;Cartera;Otras (suplementos);Anulados;Devueltos;Pendientes;Sin situación')
  for (const f of i.primas.filas) {
    l.push(['', celda(n(f.compania)), celda(f.ramo ?? 'sin ramo'), String(f.recibos), celda(f.primas), celda(f.primasNuevaProduccion), celda(f.primasCartera), celda(f.primasOtras), String(f.anulados), String(f.devueltos), String(f.pendientes), String(f.sinSituacion ?? 0)].join(';'))
  }
  l.push(['', 'TOTAL', '', String(i.primas.total.recibos), celda(i.primas.total.primas), celda(i.primas.total.primasNuevaProduccion), celda(i.primas.total.primasCartera), celda(i.primas.total.primasOtras)].join(';'))
  const sin = companiasSinPrimas(i)
  if (sin.length) l.push(celda(`Con pólizas en vigor HOY y sin recibos de CIMA este año (sus primas NO son 0, no constan): ${sin.map(n).join(', ')}`))
  if (i.primas.ilegibles) l.push(celda(`${i.primas.ilegibles} recibo(s) cobrado(s) con importe ilegible: fuera del total`))
  l.push('')
  l.push('COMISIONES (libro);Compañía;Bruto;Retención IRPF;Periodos;Sin extracto;Sin comprobar;Sin retención informada')
  if (comisiones === null) l.push(celda('No se ha podido leer el libro de comisiones: esta sección NO está vacía, falta'))
  for (const c of comisiones ?? []) {
    l.push(['', celda(c.compania), celda(c.bruto), celda(c.retencion), String(c.periodos), String(c.periodosSinExtracto), String(c.periodosSinComprobar), String(c.periodosSinRetencion)].join(';'))
  }
  l.push('')
  l.push('PÓLIZAS EN VIGOR (hoy, no a 31/12);Compañía;Ramo;Pólizas')
  for (const c of i.carteraHoy) l.push(['', celda(n(c.compania)), celda(c.ramo ?? 'sin ramo'), String(c.polizas)].join(';'))
  l.push('')
  l.push('QUEJAS DEL SAC;Recibidas;Abiertas;Cerradas en plazo;Cerradas fuera de plazo')
  l.push(['', i.quejas.total, i.quejas.abiertas, i.quejas.cerradasEnPlazo, i.quejas.cerradasFueraDePlazo].join(';'))
  return l.join('\n') + '\n'
}

// ─── Red (solo desde la ruta API) ────────────────────────────────────────────

export async function informeMediacionAsegura(año: number): Promise<{ status: number; json: unknown }> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { status: 503, json: { estado: 'sin_configurar' } }
  const base = (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/api/operador/informe-mediacion?a%C3%B1o=${año}`, {
      headers: await cabecerasPuerto(secret),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
