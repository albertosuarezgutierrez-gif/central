/**
 * Caducidad del carné de conducir (DGT): puro y testeado.
 *
 * Regla oficial (dictada por Alberto, 19/09/2026): coche/moto (AM, A1, A2, A,
 * B) se renueva cada 10 años hasta los 65, y cada 5 a partir de esa edad;
 * los permisos profesionales (C, C1, C1E, CE, D, D1, D1E, DE) cada 5 hasta
 * los 65 y cada 3 después.
 *
 * El plazo que se aplica en una renovación depende de la edad que se tenía
 * EN ESA FECHA, no de la edad de hoy — por eso hacen falta las DOS fechas
 * (`fechaCarnet` = expedición/última renovación, `fechaNacimiento`), nunca
 * una sola. Sin `fechaNacimiento` no se puede saber en qué tramo cae quien
 * esté cerca de los 65, y calcularíamos mal justo al grupo que más lo
 * necesita.
 */

const TIPOS_PROFESIONALES = new Set(['C', 'C1', 'C1E', 'CE', 'D', 'D1', 'D1E', 'DE'])

export type CaducidadCarnet = {
  /** `YYYY-MM-DD`. */
  fechaCaducidad: string
  /** Años del tramo aplicado: 10, 5 o 3. */
  plazoAnios: number
  /** Si el tramo aplicado ya es el de mayor de 65. */
  esTramoMayor: boolean
}

/**
 * Convierte una fecha `YYYY-MM-DD` en `Date` UTC, o `null` si no es una fecha
 * real (mismo criterio estricto que `fechaUtc` de `ficha-resumen.ts`: rechaza
 * lo que `Date` desliza, como un `2026-02-30`).
 */
function fechaUtc(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string') return null
  const dia = iso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const d = new Date(`${dia}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10) === dia ? d : null
}

function edadEn(fechaNacimiento: Date, fecha: Date): number {
  let edad = fecha.getUTCFullYear() - fechaNacimiento.getUTCFullYear()
  const cumpleEsteAnio = new Date(Date.UTC(fecha.getUTCFullYear(), fechaNacimiento.getUTCMonth(), fechaNacimiento.getUTCDate()))
  if (fecha.getTime() < cumpleEsteAnio.getTime()) edad -= 1
  return edad
}

function sumarAnios(fecha: Date, anios: number): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear() + anios, fecha.getUTCMonth(), fecha.getUTCDate()))
}

/**
 * Próxima caducidad de UN carné, a partir de su última expedición/renovación.
 *
 * `null` si falta cualquiera de las dos fechas o no son fechas reales — nunca
 * se adivina un plazo con un solo dato. `tipo` desconocido cae al tramo
 * ligero (coche/moto), que es el que cubre a la inmensa mayoría de la
 * cartera (1.895 de 2.189 filas de `cliente_carnets_conducir` son tipo B).
 */
export function caducidadCarnet(entrada: {
  fechaCarnet: string | null | undefined
  fechaNacimiento: string | null | undefined
  tipo: string | null | undefined
}): CaducidadCarnet | null {
  const carnet = fechaUtc(entrada.fechaCarnet)
  const nacimiento = fechaUtc(entrada.fechaNacimiento)
  if (!carnet || !nacimiento) return null

  const profesional = typeof entrada.tipo === 'string' && TIPOS_PROFESIONALES.has(entrada.tipo.trim().toUpperCase())
  const edad = edadEn(nacimiento, carnet)
  const esTramoMayor = edad >= 65
  const plazoAnios = profesional ? (esTramoMayor ? 3 : 5) : esTramoMayor ? 5 : 10

  return {
    fechaCaducidad: sumarAnios(carnet, plazoAnios).toISOString().slice(0, 10),
    plazoAnios,
    esTramoMayor,
  }
}
