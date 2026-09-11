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
  /** Los mismos campos que `CAMPOS_A_MANO` de la pantalla — solo los que
   *  vinieron con valor. Un campo ausente no entra aquí: no se rellena con
   *  cadena vacía, que se leería como «se tecleó y estaba en blanco». */
  correcciones: Record<string, string>
}

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

  return {
    codigoVehiculo: str(obj(risk.vehicle).code),
    fechaMatriculacion: str(risk.registrationDate),
    garaje: idTexto(risk.garageType),
    estadoCivilId: idTexto(holder.maritalStatus),
    municipioId: idEntero(obj(risk.circulationAddress).town),
    correcciones,
  }
}
