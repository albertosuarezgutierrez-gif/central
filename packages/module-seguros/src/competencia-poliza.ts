// La póliza que el cliente tiene HOY en la competencia (03/10/2026): tres decisiones puras sobre ella.
//
//   1. `objetivoPrioritario()`  — ¿merece que la llamemos antes? Sí si la paga una FINANCIERA, si hay
//      cesión de derechos a favor de una, o si es plurianual de pago único.
//   2. `primaActualAnualizada()` — lo que paga AL AÑO, para el «pagas X → te proponemos Y».
//   3. `ahorroFrenteActual()`   — la diferencia, solo si las dos cifras son un dato.
//
// Tres estados siempre (regla de la casa): `null` = no se sabe, nunca `0` ni «no». Sin E/S: `node --test`.

import { claveCompania } from './compania-oportunidad.ts'

// ─────────────────────────────────────────────────────────────────────────────
// 1. Objetivo prioritario
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los canales que son una FINANCIERA (o la financiera de una marca de coches), en UN solo sitio.
 * Se compara contra el canal normalizado (minúsculas, sin acentos ni puntuación) y por «contiene»:
 * «RCI BANQUE S.A. SUCURSAL EN ESPAÑA» y «Mobilize Financial Services» entran. Una financiera nueva
 * se AÑADE aquí, no en un regex suelto en otro fichero.
 */
export const CANALES_FINANCIERA: readonly string[] = [
  'rci banque',
  'mobilize',
  'santander consumer',
  'bbva consumer',
  'cetelem',
  'cofidis',
  'caixabank payments',
  'caixabank consumer',
  'sabadell consumer',
  'volkswagen financial',
  'vw bank',
  'bmw financial',
  'bmw bank',
  'mercedes benz financial',
  'mercedes benz bank',
  'toyota financial',
  'toyota kreditbank',
  'ford credit',
  'ford financial',
  'banque psa',
  'psa finance',
  'stellantis financial',
  'opel financial',
  'renault credit',
  'nissan financial',
  'hyundai capital',
  'kia finance',
  'santander financiaci',
  'financiera el corte ingles',
]

function plano(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * ¿El canal por el que se contrató es una financiera? `null` = el canal no consta (no se sabe, que
 * NO es «no lo es»). Un texto que no esté en {@link CANALES_FINANCIERA} es `false`: un agente o una
 * oficina son un canal conocido y distinto.
 */
export function esCanalFinanciera(canal: string | null | undefined): boolean | null {
  if (typeof canal !== 'string') return null
  const c = plano(canal)
  if (c === '') return null
  return CANALES_FINANCIERA.some((f) => c.includes(f))
}

export type MotivoPrioritario = 'financiera' | 'cesion_derechos' | 'plurianual_pago_unico'

export type ObjetivoPrioritario = {
  /** `true` = etiqueta «objetivo prioritario». `false` = se sabe todo y ningún motivo. `null` = faltan datos y ningún motivo. */
  prioritario: boolean | null
  motivos: MotivoPrioritario[]
  /** Para la etiqueta; `null` cuando no es (o no se sabe si es) prioritario. */
  texto: string | null
}

const TEXTO_MOTIVO: Record<MotivoPrioritario, string> = {
  financiera: 'la contrató una financiera',
  cesion_derechos: 'cesión de derechos a una financiera',
  plurianual_pago_unico: 'plurianual de pago único',
}

export function objetivoPrioritario(e: {
  canal?: string | null
  cesionDerechos?: boolean | null
  /** Pagada de una vez por varios años. */
  pagoUnico?: boolean | null
  /** Meses del periodo si se conocen; solo afina: un pago único de ≤ 12 meses no es plurianual. */
  periodoMeses?: number | null
}): ObjetivoPrioritario {
  const financiera = esCanalFinanciera(e.canal)
  const cesion = typeof e.cesionDerechos === 'boolean' ? e.cesionDerechos : null
  const pago = typeof e.pagoUnico === 'boolean' ? e.pagoUnico : null
  const meses = typeof e.periodoMeses === 'number' && Number.isFinite(e.periodoMeses) && e.periodoMeses > 0 ? e.periodoMeses : null

  const motivos: MotivoPrioritario[] = []
  if (financiera === true) motivos.push('financiera')
  if (cesion === true) motivos.push('cesion_derechos')
  if (pago === true && (meses === null || meses > 12)) motivos.push('plurianual_pago_unico')

  if (motivos.length > 0) {
    return { prioritario: true, motivos, texto: `Objetivo prioritario: ${motivos.map((m) => TEXTO_MOTIVO[m]).join(' · ')}` }
  }
  const todoSabido = financiera !== null && cesion !== null && pago !== null
  return { prioritario: todoSabido ? false : null, motivos, texto: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Prima actual anualizada
// ─────────────────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/

function dia(s: string | null | undefined): number | null {
  if (typeof s !== 'string' || !ISO.test(s)) return null
  const t = Date.parse(`${s}T00:00:00Z`)
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? null : t
}

/** Años (con decimales) de efecto a vencimiento. `null` = alguna fecha no se lee o el periodo es absurdo. */
export function periodoEnAnios(efecto: string | null | undefined, vencimiento: string | null | undefined): number | null {
  const a = dia(efecto)
  const b = dia(vencimiento)
  if (a === null || b === null || b <= a) return null
  const anios = (b - a) / 86_400_000 / 365.25
  // Un seguro de más de 10 años no existe: es una fecha mal leída, y anualizar con ella inventaría la cifra.
  return anios > 10 ? null : anios
}

/** Meses del periodo (redondeado), para `objetivoPrioritario`. `null` = no se sabe. */
export function periodoEnMeses(efecto: string | null | undefined, vencimiento: string | null | undefined): number | null {
  const a = periodoEnAnios(efecto, vencimiento)
  return a === null ? null : Math.round(a * 12)
}

export type PrimaAnualizada =
  | { anual: number; origen: 'anual' | 'anualizada'; anios: number | null }
  | { anual: null; motivo: 'prima_desconocida' | 'periodo_desconocido' | 'posible_plurianual' }

const redondea = (n: number) => Math.round(n * 100) / 100

/**
 * Lo que paga al año por la póliza actual.
 * - `pagoUnico === true` (plurianual de una vez): solo se anualiza con el periodo efecto→vencimiento
 *   CONOCIDO; sin él, `null` (dividir por un 3 supuesto sería inventar el ahorro).
 * - `pagoUnico === false`: la prima ya es de un año.
 * - `pagoUnico` desconocido: la prima se toma como anual (así se lee del documento) SALVO que las
 *   fechas digan que el periodo pasa de 13 meses: entonces no se sabe qué cubre y es `null`.
 */
export function primaActualAnualizada(e: {
  prima: number | null | undefined
  pagoUnico?: boolean | null
  fechaEfecto?: string | null
  fechaVencimiento?: string | null
}): PrimaAnualizada {
  const prima = typeof e.prima === 'number' && Number.isFinite(e.prima) && e.prima > 0 ? e.prima : null
  if (prima === null) return { anual: null, motivo: 'prima_desconocida' }
  const anios = periodoEnAnios(e.fechaEfecto, e.fechaVencimiento)

  if (e.pagoUnico === true) {
    if (anios === null) return { anual: null, motivo: 'periodo_desconocido' }
    // Años enteros cuando casi lo son (efecto 05/03 → venc. 04/03 tres años después = 3, no 2,998).
    const n = Math.abs(anios - Math.round(anios)) <= 0.05 ? Math.round(anios) : anios
    if (n <= 1.05) return { anual: prima, origen: 'anual', anios: n }
    return { anual: redondea(prima / n), origen: 'anualizada', anios: n }
  }
  if (e.pagoUnico === false) return { anual: prima, origen: 'anual', anios }
  if (anios !== null && anios > 13 / 12) return { anual: null, motivo: 'posible_plurianual' }
  return { anual: prima, origen: 'anual', anios }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. «Pagas X → te proponemos Y»
// ─────────────────────────────────────────────────────────────────────────────

export type AhorroFrenteActual = {
  actual: number
  propuesta: number
  /** Positivo = ahorra; negativo = la propuesta es más cara. */
  ahorro: number
  /** Porcentaje sobre lo que paga hoy, 1 decimal. */
  pct: number
}

/** `null` si falta cualquiera de las dos cifras: sin dato no hay ahorro, ni 0 ni «sin ahorro». */
export function ahorroFrenteActual(
  actualAnual: number | null | undefined,
  propuestaAnual: number | null | undefined,
): AhorroFrenteActual | null {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
  if (!ok(actualAnual) || !ok(propuestaAnual)) return null
  const ahorro = redondea(actualAnual - propuestaAnual)
  return { actual: actualAnual, propuesta: propuestaAnual, ahorro, pct: Math.round((ahorro / actualAnual) * 1000) / 10 }
}

/** La compañía actual y la propuesta, ¿son la misma? Para no vender «ahorro» a quien se queda donde está. */
export function esMismaCompaniaQueLaActual(actual: string | null | undefined, propuesta: string | null | undefined): boolean | null {
  const a = claveCompania(actual ?? null)
  const b = claveCompania(propuesta ?? null)
  return a === null || b === null ? null : a === b
}
