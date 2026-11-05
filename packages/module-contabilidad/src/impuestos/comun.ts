// Tipos y utilidades COMUNES de la fase 4 (impuestos). PURO: dinero en céntimos enteros, reloj inyectado, sin BD ni red.
//
// ⚠️ TODO lo de esta carpeta es BORRADOR REVISABLE: prepara cifras y su trazabilidad; NO presenta nada ante la AEAT. La presentación la hace
// el titular o su gestor con certificado digital. Ningún modelo de aquí genera todavía el fichero oficial: el «diseño de registro» de la AEAT
// no se ha podido contrastar (sede inaccesible desde el entorno de desarrollo) y NUNCA se inventan posiciones de campo.
import { ErrorContable, type Centimos } from '../partida/dinero.ts'

export type ModeloAeat = '303' | '390' | '111' | '115' | '190' | '180' | '347' | '349' | '130'
export const MODELOS_AEAT: readonly ModeloAeat[] = ['303', '390', '111', '115', '190', '180', '347', '349', '130']
export const esModeloAeat = (v: unknown): v is ModeloAeat => typeof v === 'string' && (MODELOS_AEAT as readonly string[]).includes(v)

/** `0A` = anual. */
export type PeriodoModelo = '1T' | '2T' | '3T' | '4T' | '0A'
export const PERIODOS_MODELO: readonly PeriodoModelo[] = ['1T', '2T', '3T', '4T', '0A']
export const esPeriodoModelo = (v: unknown): v is PeriodoModelo => typeof v === 'string' && (PERIODOS_MODELO as readonly string[]).includes(v)

/** Modelos de periodicidad anual (periodo `0A`) y trimestral. */
export const MODELOS_ANUALES: readonly ModeloAeat[] = ['390', '190', '180', '347']
export const esModeloAnual = (m: ModeloAeat) => MODELOS_ANUALES.includes(m)

/** Marca que lleva TODO borrador de modelo con fichero oficial: no se genera hasta contrastar el diseño de registro. */
export const DISENO_OFICIAL_PENDIENTE = 'diseño oficial pendiente de contrastar'

export type RangoFechas = { desde: string; hasta: string }

const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const finDeMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate()

/** Rango de fechas (inclusivo) de un periodo de un modelo. */
export function rangoDeModelo(anio: number, periodo: PeriodoModelo): RangoFechas {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) throw new ErrorContable('anio_invalido', `ejercicio inválido: ${String(anio)}`)
  if (periodo === '0A') return { desde: iso(anio, 1, 1), hasta: iso(anio, 12, 31) }
  const q = Number(periodo[0])
  const m0 = q * 3 - 2
  return { desde: iso(anio, m0, 1), hasta: iso(anio, m0 + 2, finDeMes(anio, m0 + 2)) }
}

export const enRango = (fecha: string, r: RangoFechas) => fecha >= r.desde && fecha <= r.hasta
export const trimestreDe = (fecha: string): 1 | 2 | 3 | 4 => (Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4

/**
 * Una casilla del modelo con su ORIGEN: qué operaciones/asientos la suman (trazabilidad casilla → origen).
 * `importe` es dinero en céntimos salvo `tipo` = 'porcentaje' (p. ej. 21) o 'numero' (recuento de perceptores).
 * `certeza` 'media' = número de casilla/composición recordados pero no contrastados con el modelo oficial vigente: hay que revisarlos.
 */
export type Casilla = {
  casilla: string
  descripcion: string
  importe: number
  tipo: 'importe' | 'porcentaje' | 'numero'
  origen: string[]
  certeza: 'alta' | 'media'
}

export const casilla = (c: string, descripcion: string, importe: number, origen: Iterable<string> = [], certeza: 'alta' | 'media' = 'alta', tipo: Casilla['tipo'] = 'importe'): Casilla =>
  ({ casilla: c, descripcion, importe, tipo, origen: [...new Set(origen)].sort(), certeza })

/** Resultado común de un cálculo de modelo: casillas + avisos + lo que NO se soporta (nunca se calcula «a medias» en silencio). */
export type CalculoModelo = {
  modelo: ModeloAeat
  anio: number
  periodo: PeriodoModelo
  casillas: Casilla[]
  /** Resultado de la autoliquidación (céntimos, + a ingresar, − a compensar/devolver); `null` si no se puede calcular de forma fiable. */
  resultado: Centimos | null
  /** Circunstancias que este cálculo NO soporta (prorrata, recargo de equivalencia…). Si hay alguna, `resultado` es null y no se puede revisar. */
  noSoportado: string[]
  avisos: string[]
  /** Referencias (asientos/facturas) que NO entran en el cálculo, con su motivo. */
  excluidas: { ref: string; motivo: string }[]
  /** Siempre `DISENO_OFICIAL_PENDIENTE` mientras no haya fichero oficial. */
  ficheroOficial: typeof DISENO_OFICIAL_PENDIENTE | null
}

export const sumar = (xs: Iterable<number>): number => { let t = 0; for (const x of xs) t += x; return t }

export function casillaDe(c: CalculoModelo, numero: string): Casilla | undefined {
  return c.casillas.find((x) => x.casilla === numero)
}
/** Importe de una casilla (0 si el modelo no la incluye). */
export const importeDe = (c: CalculoModelo, numero: string): number => casillaDe(c, numero)?.importe ?? 0

export const nifNormalizado = (nif: string | null | undefined): string | null => {
  const n = (nif ?? '').toUpperCase().replace(/[\s.\-]/g, '')
  return n === '' ? null : n
}

export function validarEjercicio(anio: number): void {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2200) throw new ErrorContable('anio_invalido', `ejercicio inválido: ${String(anio)}`)
}
