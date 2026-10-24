// Índices IPC / IRAV del INE (paso 9b). Funciones PURAS: el JSON llega como parámetro, nada de red ni reloj
// (`hoy` entra siempre inyectado). El cron de `apps/asegura` descarga, y aquí se interpreta, se valida y se
// decide qué filas son nuevas. Un índice dudoso NO se escribe: de él cuelga una renta que se le pasa al inquilino.
//
// Formato de la API Tempus del INE (`servicios.ine.es/wstempus/js/ES/DATOS_SERIE/<COD>?nult=N`):
//   { COD, Nombre, Data: [{ Fecha: <ms epoch>, FK_Periodo: 1..12, Anyo: 2026, Valor: 3.1, Secreto: false }, ...] }

export type IndiceIne = 'IPC' | 'IRAV'

export interface PuntoIndice {
  /** `YYYY-MM`. */
  periodo: string
  /** Variación anual en %, p. ej. 3.1 = 3,1 %. */
  pct: number
}

export const RANGO_PCT_INDICE = { min: -10, max: 20 } as const

const RE_PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/

export function esPeriodoIndice(v: unknown): v is string {
  return typeof v === 'string' && RE_PERIODO.test(v)
}

function numeroDePeriodo(p: string): number {
  return Number(p.slice(0, 4)) * 12 + (Number(p.slice(5, 7)) - 1)
}

function periodoDeNumero(n: number): string {
  const y = Math.floor(n / 12)
  return `${String(y).padStart(4, '0')}-${String((n % 12) + 1).padStart(2, '0')}`
}

/** Mes `YYYY-MM` de una fecha ISO (`hoy` inyectado) desplazado `meses` hacia atrás. */
export function periodoAtras(hoyIso: string, meses: number): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}/.test(hoyIso)) throw new Error(`fecha_invalida: ${hoyIso}`)
  return periodoDeNumero(numeroDePeriodo(hoyIso.slice(0, 7)) - meses)
}

/**
 * Convierte la respuesta de `DATOS_SERIE` en `{periodo, pct}[]` ordenado por periodo.
 * Lanza `formato_ine(...)` si la forma no es la esperada (no adivina ni salta puntos: un punto roto invalida la
 * descarga entera para que el cron avise en vez de escribir a medias). `indice` solo sirve para el mensaje.
 */
export function parsearSerieIne(json: unknown, indice: IndiceIne): PuntoIndice[] {
  const fallo = (m: string): never => {
    throw new Error(`formato_ine(${indice}): ${m}`)
  }
  if (json === null || typeof json !== 'object') return fallo('respuesta no es un objeto')
  const data = (json as { Data?: unknown }).Data
  if (!Array.isArray(data)) return fallo('falta Data[]')
  if (data.length === 0) return fallo('Data[] vacío')
  const out: PuntoIndice[] = []
  for (const [i, raw] of data.entries()) {
    if (raw === null || typeof raw !== 'object') return fallo(`Data[${i}] no es un objeto`)
    const p = raw as Record<string, unknown>
    let periodo: string | null = null
    if (typeof p.Anyo === 'number' && typeof p.FK_Periodo === 'number' && p.FK_Periodo >= 1 && p.FK_Periodo <= 12) {
      periodo = `${String(p.Anyo).padStart(4, '0')}-${String(p.FK_Periodo).padStart(2, '0')}`
    } else if (typeof p.Fecha === 'number' && Number.isFinite(p.Fecha)) {
      // El INE fecha a medianoche hora de Madrid (= 22:00/23:00 UTC del día anterior): +12 h cae siempre en el día bueno.
      periodo = new Date(p.Fecha + 12 * 3_600_000).toISOString().slice(0, 7)
    }
    if (!periodo) return fallo(`Data[${i}] sin periodo legible`)
    if (typeof p.Valor !== 'number') return fallo(`Data[${i}] (${periodo}) sin valor numérico`)
    out.push({ periodo, pct: p.Valor })
  }
  return out.sort((a, b) => (a.periodo < b.periodo ? -1 : a.periodo > b.periodo ? 1 : 0))
}

export type ResultadoValidacion = { ok: true } | { ok: false; errores: string[] }

/**
 * Valida una serie ya parseada: periodo `YYYY-MM` válido y sin repetir, `pct` finito dentro de −10..+20 %,
 * y meses CONSECUTIVOS (un hueco en medio es señal de que el INE o nuestro parseo se ha torcido).
 */
export function validarIndice(puntos: readonly PuntoIndice[]): ResultadoValidacion {
  const errores: string[] = []
  if (puntos.length === 0) return { ok: false, errores: ['serie vacía'] }
  const vistos = new Set<string>()
  for (const p of puntos) {
    if (!esPeriodoIndice(p.periodo)) errores.push(`periodo inválido: ${String(p.periodo)}`)
    else if (vistos.has(p.periodo)) errores.push(`periodo repetido: ${p.periodo}`)
    else vistos.add(p.periodo)
    if (typeof p.pct !== 'number' || !Number.isFinite(p.pct)) errores.push(`pct no numérico en ${String(p.periodo)}`)
    else if (p.pct < RANGO_PCT_INDICE.min || p.pct > RANGO_PCT_INDICE.max) {
      errores.push(`pct fuera de rango (${p.pct}) en ${p.periodo}`)
    }
  }
  if (errores.length === 0) {
    const ordenados = [...vistos].sort()
    for (let i = 1; i < ordenados.length; i++) {
      if (numeroDePeriodo(ordenados[i]!) - numeroDePeriodo(ordenados[i - 1]!) !== 1) {
        errores.push(`hueco entre ${ordenados[i - 1]} y ${ordenados[i]}`)
      }
    }
  }
  return errores.length ? { ok: false, errores } : { ok: true }
}

/**
 * Último periodo que YA debería estar publicado en `hoy`: mes − 1 para IPC e IRAV (los dos salen hacia el día 15
 * del mes siguiente; IRAV de junio 2026 publicado el 15/07/2026). El cron corre el día 20: si falta, es un retraso
 * real y se avisa.
 */
export function periodoEsperado(_indice: IndiceIne, hoyIso: string): string {
  return periodoAtras(hoyIso, 1)
}

/** Lectura ya guardada de un periodo (el llamador las pasa de la más antigua a la más reciente). */
export interface IndiceGuardado {
  periodo: string
  pct: number
}

export interface InsercionIndice extends PuntoIndice {
  /** `false` = primera publicación; `true` = revisión del INE (fila nueva, nunca se pisa). */
  revisado: boolean
}

const mismoPct = (a: number, b: number) => Math.abs(a - b) < 0.0005 // numeric(6,3)

/**
 * Qué hay que insertar: periodos que no tenemos (`revisado=false`) y periodos cuyo valor ha cambiado respecto a
 * la lectura vigente (`revisado=true`). Lo ya guardado e igual no se repite → dos pasadas no duplican.
 */
export function planificarInserciones(
  descargados: readonly PuntoIndice[],
  guardados: readonly IndiceGuardado[],
): InsercionIndice[] {
  const vigente = new Map<string, number>()
  for (const g of guardados) vigente.set(g.periodo, g.pct)
  const out: InsercionIndice[] = []
  for (const d of descargados) {
    const v = vigente.get(d.periodo)
    if (v === undefined) out.push({ ...d, revisado: false })
    else if (!mismoPct(v, d.pct)) out.push({ ...d, revisado: true })
  }
  return out
}
