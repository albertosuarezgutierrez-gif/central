/**
 * Lógica PURA del selector de versión del catálogo dentro de «Datos del vehículo» (07/10/2026).
 * Sin React ni red: tipos de catálogo por ramo, payload del PATCH y motivo del botón «Pedir precio».
 *
 * 🚨 Elegir versión escribe SIEMPRE los 7 campos juntos (marca, modelo, versión con el nombre del catálogo + codigoVehiculo
 * + marcaId, modeloId, motorId): el PATCH de asegura, si llegan marca/modelo/versión sin `codigoVehiculo`, borra los ids.
 */
import type { DatosVehiculoRiesgo } from '@central/module-seguros'

export type RamoCatalogo = 'auto' | 'moto'

/** Combustible de moto: enum cerrado de `versiones-moto` (`motor`). En coche sale del catálogo `motores`. */
export const MOTORES_MOTO: ReadonlyArray<{ id: string; nombre: string }> = [
  { id: 'Gasoline', nombre: 'Gasolina' },
  { id: 'Diesel', nombre: 'Diésel' },
  { id: 'Others', nombre: 'Otros' },
]

/** Solo coche y moto tienen catálogo de versiones; cualquier otro ramo → `null`. */
export function ramoCatalogo(ramo: string): RamoCatalogo | null {
  return ramo === 'auto' || ramo === 'moto' ? ramo : null
}

/** Sufijo `-moto` según ramo: marcas, modelos, versiones y garajes. */
export function tiposCatalogo(ramo: RamoCatalogo): { marcas: string; modelos: string; versiones: string; garajes: string } {
  const s = ramo === 'moto' ? '-moto' : ''
  return { marcas: `marcas${s}`, modelos: `modelos${s}`, versiones: `versiones${s}`, garajes: `garajes${s}` }
}

export function paramsModelos(ramo: RamoCatalogo, marcaId: string): Record<string, string> {
  return { tipo: tiposCatalogo(ramo).modelos, marcaId }
}

export function paramsVersiones(ramo: RamoCatalogo, marcaId: string, modeloId: string, motor: string): Record<string, string> {
  return { tipo: tiposCatalogo(ramo).versiones, marcaId, modeloId, motor }
}

export type SeleccionVersion = {
  marca: string
  modelo: string
  version: string
  codigoVehiculo: string
  marcaId: string
  modeloId: string
  motorId: string
}

type Op = { id: string; nombre: string }

/** Los 7 campos de la versión elegida, con los NOMBRES del catálogo; `null` si la cascada no está completa. */
export function seleccionDeVersion(e: {
  marcas: readonly Op[]; modelos: readonly Op[]; versiones: readonly Op[]
  marcaId: string; modeloId: string; motorId: string; codigoVehiculo: string
}): SeleccionVersion | null {
  const marca = e.marcas.find((m) => m.id === e.marcaId)
  const modelo = e.modelos.find((m) => m.id === e.modeloId)
  const version = e.versiones.find((v) => v.id === e.codigoVehiculo)
  if (!marca || !modelo || !version || !e.motorId) return null
  return {
    marca: marca.nombre, modelo: modelo.nombre, version: version.nombre,
    codigoVehiculo: version.id, marcaId: marca.id, modeloId: modelo.id, motorId: e.motorId,
  }
}

/** El cuerpo de `datosVehiculo` del PATCH: SIEMPRE los 7 campos juntos. */
export function payloadVersion(s: SeleccionVersion): Record<string, string> {
  return {
    marca: s.marca, modelo: s.modelo, version: s.version,
    codigoVehiculo: s.codigoVehiculo, marcaId: s.marcaId, modeloId: s.modeloId, motorId: s.motorId,
  }
}

/** El garaje de Codeoscopic es otro catálogo en moto (`garajes-moto`): leer el de coche daba ids que la moto no reconoce. */
export function tipoGaraje(ramo: string): 'garajes' | 'garajes-moto' {
  return ramo === 'moto' ? 'garajes-moto' : 'garajes'
}

/**
 * Por qué el botón «Pedir precio →» no está disponible (o `null` si lo está). Solo navega a la pantalla de precio
 * (que es donde se confirma y cuesta 0,50€): nunca cotiza por sí mismo.
 * Lo mínimo que esa pantalla necesita del riesgo: versión del catálogo y matrícula o fecha de matriculación prevista.
 */
export function motivoSinPrecio(
  d: Pick<DatosVehiculoRiesgo, 'codigoVehiculo' | 'matricula' | 'fechaMatriculacion'>,
  e: { editando: boolean; eligiendo: boolean; ocupado: boolean; ramoCotizable: boolean },
): string | null {
  if (!e.ramoCotizable) return 'Este ramo no se cotiza desde aquí.'
  if (e.editando || e.eligiendo) return 'Termina de editar los datos del vehículo primero.'
  if (e.ocupado) return 'Guardando…'
  const falta: string[] = []
  if (!d.codigoVehiculo) falta.push('la versión del catálogo')
  if (!d.matricula && !d.fechaMatriculacion) falta.push('la matrícula o la fecha de matriculación')
  return falta.length === 0 ? null : `Falta elegir ${falta.join(' y ')}.`
}
