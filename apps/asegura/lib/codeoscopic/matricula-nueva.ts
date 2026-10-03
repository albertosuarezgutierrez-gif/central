// Vehículo NUEVO sin matrícula todavía (03/10/2026, Alberto): un coche/moto recién comprado se
// tarifica ANTES de matricularse. El vendor no exige `risk.registrationPlate` (CarRisk_V1 y
// MotorcycleRisk_V1: opcional; `registrationDate` solo es obligatoria si HAY matrícula), así que en
// auto-nuevo / moto-nuevo la matrícula deja de ser obligatoria SI se sabe el vehículo (código Base7)
// y la fecha de matriculación PREVISTA, a no más de 90 días (el mismo horizonte que la fecha de
// efecto, `MAX_DIAS_VISTA`). En el resto de flujos (retarificar una póliza) sigue siendo obligatoria.
//
// Sin matrícula el campo se OMITE del cuerpo (ni '' ni null): ningún fixture del vendor enseña qué
// hace con un vacío, y omitirlo es lo único que el esquema documenta como válido.
//
// 🚨 Y `previousInsurance.registrationPlate` SÍ es obligatorio: sin matrícula del vehículo nuevo ya no
// hay de dónde copiarla, así que con seguro anterior hace falta la de ESA póliza (`matriculaAnterior`).

import { MAX_DIAS_VISTA, RE_FECHA_ISO, hoyEnMadrid, sumarDias } from './fecha-efecto.ts'

export type DatosMatricula = {
  matricula?: string | null
  codigoVehiculo?: string | null
  fechaMatriculacion?: string | null
  aseguradoAntes?: boolean | null
  matriculaAnterior?: string | null
}

const lleno = (v: unknown) => typeof v === 'string' && v.trim() !== ''

/** ¿Lleva matrícula? */
export function tieneMatricula(d: DatosMatricula): boolean {
  return lleno(d.matricula)
}

/**
 * Los reparos de la matrícula. Con matrícula, ninguno (el resto de la revisión manda). Sin ella:
 * fuera de vehículo nuevo es obligatoria; en vehículo nuevo exige código del vehículo, fecha de
 * matriculación prevista (≤ 90 días) y, si se declara seguro anterior, la matrícula de esa póliza.
 */
export function reparosMatricula(
  d: DatosMatricula,
  opciones: { vehiculoNuevo?: boolean; hoy?: string },
): { campo: 'matricula' | 'fechaMatriculacion' | 'matriculaAnterior'; motivo: string }[] {
  if (tieneMatricula(d)) return []
  if (!opciones.vehiculoNuevo) return [{ campo: 'matricula', motivo: 'hace falta para poder cotizar' }]
  const r: { campo: 'matricula' | 'fechaMatriculacion' | 'matriculaAnterior'; motivo: string }[] = []
  if (!lleno(d.codigoVehiculo)) {
    r.push({ campo: 'matricula', motivo: 'sin matrícula hay que elegir el vehículo exacto (versión del catálogo)' })
  }
  const f = d.fechaMatriculacion
  const hoy = opciones.hoy ?? hoyEnMadrid()
  if (lleno(f) && RE_FECHA_ISO.test(String(f)) && String(f) > sumarDias(hoy, MAX_DIAS_VISTA)) {
    r.push({ campo: 'fechaMatriculacion', motivo: `sin matrícula, la matriculación prevista no puede pasar de ${MAX_DIAS_VISTA} días desde hoy` })
  }
  if (d.aseguradoAntes && !lleno(d.matriculaAnterior)) {
    r.push({
      campo: 'matriculaAnterior',
      motivo: 'el vehículo aún no tiene matrícula: hace falta la de la póliza anterior (la compañía busca el historial por ella)',
    })
  }
  return r
}
