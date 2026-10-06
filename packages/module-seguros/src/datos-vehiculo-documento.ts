/**
 * Del documento al riesgo (05/10/2026): lo que el OCR leyó de una póliza de auto/moto, convertido en
 * `info_riesgo.datosVehiculo` para que NINGUNA pantalla vuelva a pedir lo que ya consta.
 *
 * Regla única: el riesgo se rellena UNA vez (documento o corredora) en `datosVehiculo` y toda pantalla lo lee de ahí.
 *
 * Puro (sin red ni BD). Tres estados: lo que el documento no trae queda `null` (nunca se inventa), y todo
 * lo escrito aquí queda SIN CONFIRMAR (`confirmadoAt: null`): lo confirma la corredora en la pantalla del riesgo.
 * Cada campo pasa por `validarDatosVehiculoRiesgo`: el que no valida (fecha futura, matrícula rara) se descarta
 * solo, sin tirar el resto.
 */
import { datosVehiculoVacios, validarDatosVehiculoRiesgo, type DatosVehiculoRiesgo } from './datos-vehiculo-riesgo.ts'

/** Lo que el OCR trae del vehículo (subconjunto de `AutoLeido`; todo puede ser `null`/ausente). */
export type VehiculoLeido = {
  matricula?: string | null
  marca?: string | null
  modelo?: string | null
  version?: string | null
  fechaMatriculacion?: string | null
}

/** Ids del catálogo emparejados (todos `null` si no hubo coincidencia INEQUÍVOCA o el catálogo no respondió). */
export type IdsCatalogoVehiculo = {
  marcaId: string | null
  modeloId: string | null
  motorId: string | null
  codigoVehiculo: string | null
}

export const SIN_IDS_CATALOGO: IdsCatalogoVehiculo = { marcaId: null, modeloId: null, motorId: null, codigoVehiculo: null }

const CAMPOS_LEIDOS = ['matricula', 'marca', 'modelo', 'version', 'fechaMatriculacion'] as const

/**
 * `datosVehiculo` desde lo leído, o `null` si el documento no trae NADA del vehículo (no se escribe un bloque vacío:
 * que `datosVehiculo` exista significa que alguien o algo lo rellenó).
 */
export function datosVehiculoDeDocumento(
  leido: VehiculoLeido,
  ids: IdsCatalogoVehiculo = SIN_IDS_CATALOGO,
  opciones: { hoy?: string } = {},
): DatosVehiculoRiesgo | null {
  const candidato: Record<string, unknown> = {}
  for (const k of CAMPOS_LEIDOS) {
    const v = leido[k]
    if (typeof v === 'string' && v.trim() !== '') candidato[k] = v
  }
  // Los ids solo tienen sentido con su marca leída: un id suelto sin texto no se puede contrastar con el documento.
  if (candidato.marca && ids.marcaId) {
    candidato.marcaId = ids.marcaId
    if (candidato.modelo && ids.modeloId) {
      candidato.modeloId = ids.modeloId
      if (ids.motorId) {
        candidato.motorId = ids.motorId
        if (ids.codigoVehiculo) candidato.codigoVehiculo = ids.codigoVehiculo
      }
    }
  }
  if (Object.keys(candidato).length === 0) return null

  // Campo a campo: lo que no valida se descarta, el resto se queda.
  const v = validarDatosVehiculoRiesgo(candidato, opciones.hoy ? { hoy: opciones.hoy } : {})
  let valor: Partial<DatosVehiculoRiesgo>
  if (v.ok) valor = v.valor
  else {
    const malos = new Set<string>(v.errores.map((e) => e.campo))
    const resto = Object.fromEntries(Object.entries(candidato).filter(([k]) => !malos.has(k)))
    const r2 = validarDatosVehiculoRiesgo(resto, opciones.hoy ? { hoy: opciones.hoy } : {})
    valor = r2.ok ? r2.valor : {}
  }
  const datos: DatosVehiculoRiesgo = { ...datosVehiculoVacios(), ...valor, confirmadoAt: null }
  const hayAlgo = Object.entries(datos).some(([k, x]) => k !== 'confirmadoAt' && x !== null)
  return hayAlgo ? datos : null
}
