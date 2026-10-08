// PACK coche + moto OPCIONAL (03/10/2026): qué «otro vehículo» se tarifica y si cabe. Puro y sin E/S;
// la llamada de pago (0,50€) la lanza la acción de servidor tras el clic de confirmación del corredor.
//
// Tres estados: lo que no consta del otro vehículo (versión, matrícula, matriculación) NO se inventa:
// se dice y el pack no se tarifica. Nunca se adivina un coche por la matrícula de otro.
import { costePack, type DatosVehiculoRiesgo } from '@central/module-seguros'
import { limitesFechaEfecto, MAX_DIAS_EFECTO, DIAS_EFECTO_DEFECTO } from './fecha-efecto.ts'
import { eur } from '../dinero.ts'

/** Lo que cuesta cada llamada a Codeoscopic. Mismo cartel que el botón «Pedir precio — cuesta 0,50€». */
export const COSTE_LLAMADA_EUR = 0.5

export type RamoPack = 'auto' | 'moto'
export const otroRamoPack = (r: RamoPack): RamoPack => (r === 'auto' ? 'moto' : 'auto')
const ROTULO: Record<RamoPack, string> = { auto: 'coche', moto: 'moto' }

type OportunidadMinima = { id: string; ramo: string | null; estado: string; matricula: string | null; vehiculo: string | null }
const CERRADAS = new Set(['ganada', 'perdida'])

export type OtroVehiculo =
  | { estado: 'uno'; oportunidadId: string; etiqueta: string | null; ramo: RamoPack }
  | { estado: 'ninguno'; ramo: RamoPack }
  | { estado: 'ambiguo'; ramo: RamoPack; n: number }

/**
 * El «otro vehículo» del cliente: su ÚNICA oportunidad abierta del otro ramo. Con dos (dos motos) no se
 * elige a ojo: tarificar la moto equivocada es un precio plausible y falso que además se paga.
 */
export function otroVehiculoDelCliente(ops: readonly OportunidadMinima[], ramoActual: RamoPack): OtroVehiculo {
  const ramo = otroRamoPack(ramoActual)
  const abiertas = ops.filter((o) => o.ramo === ramo && !CERRADAS.has(o.estado))
  if (abiertas.length === 0) return { estado: 'ninguno', ramo }
  if (abiertas.length > 1) return { estado: 'ambiguo', ramo, n: abiertas.length }
  const o = abiertas[0]
  return { estado: 'uno', oportunidadId: o.id, etiqueta: [o.matricula, o.vehiculo].filter(Boolean).join(' · ') || null, ramo }
}

export type PlanPack =
  | { ok: true; resueltos: Record<string, unknown>; fechaEfecto: string | null }
  | { ok: false; motivo: string }

const sumarDias = (iso: string, d: number) => {
  const t = new Date(`${iso}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + d)
  return t.toISOString().slice(0, 10)
}

/**
 * ¿Se puede tarificar el otro vehículo con lo que su riesgo ya sabe? `datos` es su
 * `info_riesgo.datosVehiculo`. Los dos cepos de fecha son los del vendor: efecto entre hoy y 90 días vista,
 * y matriculación PREVISTA a no más de 90 días (un vehículo que se matricula dentro de seis meses no se
 * puede tarificar hoy: se dice y no se paga). El efecto es el de la pantalla (los dos vehículos entran a la vez).
 */
export function planPackOtroVehiculo(e: {
  ramo: RamoPack
  datos: DatosVehiculoRiesgo | null
  /** El efecto tecleado en la pantalla; `''`/`null` = el defecto del servidor (hoy + 15 días). */
  fechaEfecto: string | null | undefined
  ahora?: Date
}): PlanPack {
  const nombre = ROTULO[e.ramo]
  const d = e.datos
  if (!d) return { ok: false, motivo: `El ${nombre} no tiene datos del vehículo guardados: ábrelo, elige su versión y pide precio allí una vez (o hazlo aquí por separado).` }
  const faltan: string[] = []
  if (!d.codigoVehiculo) faltan.push('la versión')
  if (!d.matricula) faltan.push('la matrícula')
  if (!d.fechaMatriculacion) faltan.push('la fecha de matriculación')
  if (e.ramo === 'moto' && (!d.marcaId || !d.modeloId || !d.motorId)) faltan.push('marca, modelo y motor')
  if (faltan.length > 0) return { ok: false, motivo: `Del ${nombre} no consta ${faltan.join(', ')}: no se tarifica el pack hasta completarlo (no se adivina).` }

  const { min, max } = limitesFechaEfecto(e.ahora)
  const efecto = typeof e.fechaEfecto === 'string' && e.fechaEfecto !== '' ? e.fechaEfecto : null
  if (efecto !== null && (efecto < min || efecto > max)) {
    return { ok: false, motivo: `La fecha de efecto (${efecto}) está fuera de lo que admite la compañía: entre hoy y ${MAX_DIAS_EFECTO} días vista.` }
  }
  // Matriculación futura: tiene que caber en la misma ventana de 90 días.
  if (d.fechaMatriculacion! > max) {
    return { ok: false, motivo: `El ${nombre} se matricula el ${d.fechaMatriculacion}, a más de ${MAX_DIAS_EFECTO} días vista: no cabe en el pack y no se tarifica todavía.` }
  }
  const efectoReal = efecto ?? sumarDias(min, DIAS_EFECTO_DEFECTO)
  if (d.fechaMatriculacion! > efectoReal) {
    return { ok: false, motivo: `El ${nombre} se matricula el ${d.fechaMatriculacion}, después de la fecha de efecto (${efectoReal}): pon un efecto posterior a la matriculación.` }
  }

  const resueltos: Record<string, unknown> = {
    codigoVehiculo: d.codigoVehiculo,
    matricula: d.matricula,
    fechaMatriculacion: d.fechaMatriculacion,
    ...(e.ramo === 'moto' ? { marcaId: d.marcaId, modeloId: d.modeloId, motor: d.motorId } : {}),
    ...(d.garaje ? { garaje: d.garaje } : {}),
  }
  return { ok: true, resueltos, fechaEfecto: efecto }
}

/** El texto del coste ANTES de lanzar: dos llamadas, cuánto cada una y el total. `null` = no se sabe el precio. */
export function textoCostePack(llamadasYaHechas: number): string {
  const total = costePack(COSTE_LLAMADA_EUR, 1)
  return total === null
    ? 'No se conoce el coste de la llamada: no se lanza.'
    : `Otra llamada de pago: ${eur(total)} reales. ${llamadasYaHechas > 0 ? `Con la ya hecha, el pack suma ${eur(COSTE_LLAMADA_EUR * (llamadasYaHechas + 1))}.` : `Con la de esta pantalla, el pack suma ${eur(COSTE_LLAMADA_EUR * 2)}.`}`
}
