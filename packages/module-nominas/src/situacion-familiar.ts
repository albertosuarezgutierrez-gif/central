/**
 * Modelo 145 (comunicación de datos al pagador) como tipo de datos CON VIGENCIA (histórico).
 * Una fila = una comunicación del trabajador, válida desde `vigenteDesde` hasta `vigenteHasta` (null = abierta).
 * Sin comunicación vigente en la fecha → `situacionVigente` devuelve null («no se sabe» ≠ «sin hijos»): el IRPF aplica la
 * regla de ausencia del modelo 145 (irpf.ts), nunca una situación inventada.
 * Fechas ISO `YYYY-MM-DD`. Sin NIF ni nombres: aquí solo van los datos que cambian el mínimo personal y familiar.
 * Pendiente (N1): firma con core-firma → `firmaDocumentoId` (hoy solo referencia; el cálculo NO exige firma todavía).
 */
import type { Centimos } from './dinero'

export type CodigoSituacionFamiliar = 1 | 2 | 3 // 1 = hijos exclusivamente a cargo · 2 = casado, cónyuge sin rentas > 1.500 € · 3 = otros
export type GradoDiscapacidad = 'ninguna' | '33' | '65'

export interface DescendienteModelo145 {
  fechaNacimiento: string
  discapacidad: GradoDiscapacidad
  necesitaAsistencia?: boolean
  /** true = lo computa por entero este pagador/contribuyente; false = a medias con el otro progenitor. */
  porEntero: boolean
  /** Rentas anuales > 8.000 € (sin contar exentas): no da mínimo. */
  rentasMayores8000?: boolean
}

export interface AscendienteModelo145 {
  fechaNacimiento: string
  discapacidad: GradoDiscapacidad
  necesitaAsistencia?: boolean
  porEntero: boolean
  convive: boolean
  rentasMayores8000?: boolean
}

export interface SituacionFamiliar {
  vigenteDesde: string
  vigenteHasta: string | null
  situacion: CodigoSituacionFamiliar
  fechaNacimientoContribuyente: string
  discapacidad: GradoDiscapacidad
  necesitaAsistencia?: boolean
  descendientes: DescendienteModelo145[]
  ascendientes: AscendienteModelo145[]
  /** Pensión compensatoria al cónyuge por decisión judicial (anual, céntimos): reduce la base. */
  pensionCompensatoriaAnual?: Centimos
  /** Anualidades por alimentos a hijos por decisión judicial (anual): regla pendiente en irpf.ts. */
  anualidadesAlimentosAnual?: Centimos
  /** Préstamo de vivienda habitual adquirida antes de 2013 con deducción. */
  hipotecaViviendaAnterior2013?: boolean
  /** TODO N1 (core-firma): id del documento firmado del modelo 145. */
  firmaDocumentoId?: string | null
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
const esFecha = (s: string) => FECHA.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

export function añoDe(fecha: string): number {
  if (!esFecha(fecha)) throw new Error(`Fecha inválida: ${fecha}`)
  return Number(fecha.slice(0, 4))
}

/** Edad cumplida a 31-12 del año de devengo (criterio del art. 57 y ss. LIRPF). */
export function edadA31Dic(fechaNacimiento: string, año: number): number {
  return año - añoDe(fechaNacimiento)
}

export function validarSituacionFamiliar(s: SituacionFamiliar): string[] {
  const e: string[] = []
  if (!esFecha(s.vigenteDesde)) e.push('vigenteDesde inválida')
  if (s.vigenteHasta !== null && !esFecha(s.vigenteHasta)) e.push('vigenteHasta inválida')
  if (s.vigenteHasta !== null && esFecha(s.vigenteDesde) && s.vigenteHasta < s.vigenteDesde) e.push('vigenteHasta anterior a vigenteDesde')
  if (![1, 2, 3].includes(s.situacion)) e.push('situacion debe ser 1, 2 ó 3')
  if (!esFecha(s.fechaNacimientoContribuyente)) e.push('fechaNacimientoContribuyente inválida')
  for (const [i, d] of s.descendientes.entries()) if (!esFecha(d.fechaNacimiento)) e.push(`descendiente ${i + 1}: fecha inválida`)
  for (const [i, a] of s.ascendientes.entries()) if (!esFecha(a.fechaNacimiento)) e.push(`ascendiente ${i + 1}: fecha inválida`)
  for (const [k, v] of [['pensionCompensatoriaAnual', s.pensionCompensatoriaAnual], ['anualidadesAlimentosAnual', s.anualidadesAlimentosAnual]] as const) {
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 0)) e.push(`${k} debe ser céntimos enteros ≥ 0`)
  }
  return e
}

/** Solapes entre comunicaciones de un mismo empleado (el histórico no puede tener dos vigentes a la vez). */
export function validarHistorial(historial: SituacionFamiliar[]): string[] {
  const orden = [...historial].sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))
  const e: string[] = []
  for (let i = 1; i < orden.length; i++) {
    const ant = orden[i - 1]
    if (ant.vigenteHasta === null || ant.vigenteHasta >= orden[i].vigenteDesde) {
      e.push(`solape: la comunicación desde ${ant.vigenteDesde} sigue vigente el ${orden[i].vigenteDesde}`)
    }
  }
  return e
}

/** Comunicación vigente en `fecha`; si el histórico solapa, gana la más reciente. Ninguna → null. */
export function situacionVigente(historial: SituacionFamiliar[], fecha: string): SituacionFamiliar | null {
  if (!esFecha(fecha)) throw new Error(`Fecha inválida: ${fecha}`)
  const v = historial.filter(s => s.vigenteDesde <= fecha && (s.vigenteHasta === null || fecha <= s.vigenteHasta))
  if (!v.length) return null
  return v.sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0]
}
