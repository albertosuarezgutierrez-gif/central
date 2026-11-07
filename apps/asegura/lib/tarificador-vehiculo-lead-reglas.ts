// IDEA 4 del tarificador (07/11/2026): «matrícula por bot como primer paso de todo lead de coche» — reglas PURAS.
// La parte con BD está en `tarificador-vehiculo-lead.ts`; el interruptor es `TARIFICADOR_VEHICULO_ACTIVO` (apagado por defecto).
// 🚨 TARIFICAR ≠ EMITIR: solo se rellena la ficha del vehículo (marca/modelo/versión/1ª matriculación). Nada se confirma ni se envía.
// 🧑 El dato humano gana: nunca se escribe sobre una ficha confirmada, ni con marca/modelo/código de versión ya puestos
//    (por una persona, por el volcado o por una cotización). `null` = «no se sabe», no «vacío a rellenar sin mirar».
// 🔒 La matrícula no se loguea (la lleva el trabajo, que la purga al cerrar).

import { leerDatosVehiculo } from '@central/module-seguros'
import { normalizarMatriculaConsulta, type ResultadoVehiculo } from './tarificador-vehiculo-reglas.ts'

/** Clave de `info_riesgo` con la marca de «ya se consultó»: una sola vez por oportunidad (acota el gasto y evita bucles). */
export const CLAVE_CONSULTA_VEHICULO = 'vehiculoConsulta'
/** Tras estas horas sin resultado, la consulta se da por caducada (no se reintenta sola). */
export const HORAS_CADUCA_CONSULTA = 24
export const MAX_ENCOLAR_POR_BARRIDO = 5

export type MarcaConsulta = { estado: 'encolada' | 'aplicada' | 'sin_resultado' | 'caducada'; at: string }

type Info = Record<string, unknown> | null | undefined
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** Matrícula del riesgo: la estructurada manda; si no, la clave antigua. Solo si es española plausible. */
export function matriculaDeRiesgo(info: Info): string | null {
  const dv = info && typeof info.datosVehiculo === 'object' && info.datosVehiculo ? (info.datosVehiculo as Record<string, unknown>) : null
  return normalizarMatriculaConsulta(txt(dv?.matricula) ?? txt(info?.matricula) ?? '')
}

/** ¿La ficha ya tiene vehículo (de quien sea) o está confirmada? Entonces el bot NO escribe. */
export function fichaOcupada(info: Info): boolean {
  const d = leerDatosVehiculo(info?.datosVehiculo)
  if (d && (d.confirmadoAt !== null || d.marca !== null || d.modelo !== null || d.codigoVehiculo !== null)) return true
  // Claves antiguas del volcado (`marca`, `modelo`, `vehiculo` en texto): también son dato.
  return txt(info?.marca) !== null || txt(info?.modelo) !== null || txt(info?.vehiculo) !== null
}

export function leerMarcaConsulta(info: Info): MarcaConsulta | null {
  const m = info?.[CLAVE_CONSULTA_VEHICULO]
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  const estado = o.estado
  const at = txt(o.at)
  if (!at || (estado !== 'encolada' && estado !== 'aplicada' && estado !== 'sin_resultado' && estado !== 'caducada')) return null
  return { estado, at }
}

export type DecisionLead = { accion: 'consultar'; matricula: string } | { accion: 'omitir'; motivo: string }

/** ¿Hay que encolar la consulta de vehículo para esta oportunidad? Solo auto, abierta, con matrícula, ficha libre y nunca consultada. PURA. */
export function decidirConsultaLead(o: { tipo: string; abierta: boolean; info: Info }): DecisionLead {
  if (o.tipo !== 'auto') return { accion: 'omitir', motivo: 'no_es_auto' }
  if (!o.abierta) return { accion: 'omitir', motivo: 'cerrada' }
  const matricula = matriculaDeRiesgo(o.info)
  if (!matricula) return { accion: 'omitir', motivo: 'sin_matricula' }
  if (fichaOcupada(o.info)) return { accion: 'omitir', motivo: 'ficha_con_datos' }
  if (leerMarcaConsulta(o.info)) return { accion: 'omitir', motivo: 'ya_consultada' }
  return { accion: 'consultar', matricula }
}

/**
 * Lo que se escribe en `datosVehiculo` con el resultado del bot, o `null` si no se escribe nada. Solo rellena HUECOS (version y
 * fechaMatriculacion si estaban a `null`); marca y modelo solo entran juntos y con la ficha libre. Nunca `confirmadoAt`. PURA.
 */
export function valorDesdeResultado(info: Info, r: ResultadoVehiculo): Record<string, string | null> | null {
  if (r.estado !== 'ok') return null
  if (fichaOcupada(info)) return null
  const d = leerDatosVehiculo(info?.datosVehiculo)
  const v = r.vehiculo
  const out: Record<string, string | null> = { marca: v.marca, modelo: v.modelo }
  if (v.version !== null && (d?.version ?? null) === null) out.version = v.version
  if (v.fechaMatriculacion !== null && (d?.fechaMatriculacion ?? null) === null) out.fechaMatriculacion = v.fechaMatriculacion
  return out
}

/** ¿Una consulta `encolada` lleva demasiado sin respuesta? PURA. */
export function consultaCaducada(m: MarcaConsulta, ahora: Date): boolean {
  const t = Date.parse(m.at)
  return Number.isNaN(t) || ahora.getTime() - t > HORAS_CADUCA_CONSULTA * 3_600_000
}
