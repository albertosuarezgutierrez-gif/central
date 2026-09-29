// Reconstruye del `peticion` guardado en `seguros.tarificaciones` los campos
// que el corredor tecleó a mano en el formulario de retarificar auto, para
// poder "retomar" una cotización sin volver a escribirlos.
//
// PURO: entra el `CreateInsuranceRequest_V1` tal cual se guardó (el mismo que
// construye `peticion-auto.ts`), sale lo que se puede leer de él. Nada se
// adivina — un campo ausente o con forma rara sale `null`/fuera de
// `correcciones`, nunca un valor inventado.

export type FormularioAutoGuardado = {
  /** El código Base7 de la versión (`risk.vehicle.code`). */
  codigoVehiculo: string | null
  fechaMatriculacion: string | null
  /** Id del catálogo de garajes (`risk.garageType.id`). */
  garaje: string | null
  /** Id del catálogo de estados civiles (`holder.maritalStatus.id`). */
  estadoCivilId: string | null
  /** Id del catálogo de municipios (`risk.circulationAddress.town.id`). */
  municipioId: number | null
  /** Id del catálogo de tipos de vía (`holder.addresses[0].roadType.id`). */
  tipoViaId: string | null
  /** Los mismos campos que `CAMPOS_A_MANO` de la pantalla — solo los que
   *  vinieron con valor. Un campo ausente no entra aquí: no se rellena con
   *  cadena vacía, que se leería como «se tecleó y estaba en blanco». */
  correcciones: Record<string, string>
}

import { leerCampoPersona } from './interprete-400.ts'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null
const idTexto = (v: unknown): string | null => {
  const id = obj(v).id
  if (typeof id === 'string' || typeof id === 'number') return str(String(id))
  return null
}
const idEntero = (v: unknown): number | null => {
  const t = idTexto(v)
  if (t === null) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n) : null
}

export function extraerFormularioAuto(peticion: unknown): FormularioAutoGuardado {
  const p = obj(peticion)
  const risk = obj(p.risk)
  const holder = obj(p.holder)
  const carnet = obj(arr(holder.drivingLicenses)[0])
  const telefono = str(obj(arr(holder.phones)[0]).number)

  const correcciones: Record<string, string> = {}
  const poner = (campo: string, valor: string | null) => {
    if (valor !== null) correcciones[campo] = valor
  }
  poner('dni', str(obj(holder.identificationDocument).id))
  poner('nombre', str(holder.name))
  poner('apellido1', str(holder.surname))
  poner('telefono', telefono)
  poner('fechaNacimiento', str(holder.birthDate))
  poner('fechaCarnet', str(carnet.date))
  // La calle completa y el correo (12/09/2026): lo que tecleó el corredor
  // porque la ficha no lo traía, para no volver a pedírselo.
  const direccion = obj(arr(holder.addresses)[0])
  poner('nombreVia', str(direccion.roadName))
  poner('numeroVia', str(direccion.roadNumber))
  // Por `leerCampoPersona`, que usa `CLAVE_EMAIL_VENDOR` (y tolera `emails[]`):
  // si la clave cambia, esto la sigue sin tocar nada.
  poner('email', leerCampoPersona(holder, 'email'))

  return {
    codigoVehiculo: str(obj(risk.vehicle).code),
    fechaMatriculacion: str(risk.registrationDate),
    garaje: idTexto(risk.garageType),
    estadoCivilId: idTexto(holder.maritalStatus),
    municipioId: idEntero(obj(risk.circulationAddress).town),
    tipoViaId: idTexto(direccion.roadType),
    correcciones,
  }
}

/**
 * El vehículo de una petición de COCHE o MOTO nueva ya pagada (28/09/2026), para volver a pedir precio
 * del mismo vehículo sin dictarlo otra vez. `null` si la petición no trae el código de la versión: sin él
 * no hay vehículo que reutilizar, y no se rellena a medias.
 */
export type VehiculoGuardado = {
  codigoVehiculo: string
  matricula: string | null
  fechaMatriculacion: string | null
  kmAnuales: number | null
  /** Id del catálogo de garajes (`risk.garageType.id`). Sin él, retomar caía en silencio a «vía
   *  pública» (29/09/2026: una re-cotización pensada con garaje privado salió con NoGarage). */
  garaje: string | null
}

export function extraerVehiculoGuardado(peticion: unknown): VehiculoGuardado | null {
  const risk = obj(obj(peticion).risk)
  const code = obj(risk.vehicle).code
  const codigoVehiculo = typeof code === 'string' || typeof code === 'number' ? str(String(code)) : null
  if (codigoVehiculo === null) return null
  const km = risk.kilometersPerYear
  return {
    codigoVehiculo,
    matricula: str(risk.registrationPlate),
    fechaMatriculacion: str(risk.registrationDate),
    kmAnuales: typeof km === 'number' && Number.isFinite(km) && km >= 0 ? Math.round(km) : null,
    garaje: idTexto(risk.garageType),
  }
}

/**
 * El seguro anterior declarado en una petición (`risk.previousInsurance`), para no volver a
 * dictarlo en la siguiente variante del mismo vehículo (29/09/2026: una variante sin él perdió la
 * bonificación y el precio pasó de 200 a 360€). Completo o `null`: medio historial es un precio que
 * la compañía corrige al emitir.
 */
export type HistorialGuardado = {
  companiaCodigo: string
  poliza: string
  aniosAsegurado: number
  aniosEnCompania: number
  aniosSinSiniestros: number
  matricula: string | null
}

export function extraerHistorialGuardado(peticion: unknown): HistorialGuardado | null {
  const risk = obj(obj(peticion).risk)
  const p = obj(risk.previousInsurance)
  const codigo = str(obj(p.previousCompany).code)
  const poliza = typeof p.policyNumber === 'number' ? String(p.policyNumber) : str(p.policyNumber)
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 80 ? v : null)
  const asegurado = n(p.totalYearsInsured)
  const enCompania = n(p.yearsInPreviousCompany)
  const sinSiniestros = n(p.yearsWithoutAccidents)
  if (!codigo || !poliza || asegurado === null || enCompania === null || sinSiniestros === null) return null
  return {
    companiaCodigo: codigo, poliza, aniosAsegurado: asegurado, aniosEnCompania: enCompania, aniosSinSiniestros: sinSiniestros,
    matricula: str(p.registrationPlate) ?? str(risk.registrationPlate),
  }
}
