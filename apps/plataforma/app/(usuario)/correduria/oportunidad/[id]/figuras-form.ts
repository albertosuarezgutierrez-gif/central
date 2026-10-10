// Las FIGURAS de una variante en las pantallas de pedir precio (auto-nuevo, moto-nuevo), 29/09/2026.
// Con la figura en OTRA ficha, sus datos los pone asegura desde esa ficha. Aquí solo se pide lo
// que la ficha no trae en forma de compañía: el estado civil (catálogo del vendor) y lo que falte.
// PURO (sin React): lo comparten `AutoNuevo.tsx` y `MotoNuevo.tsx`, y lo cubre `figuras-form.test.ts`.

import type { RolExtra } from './variante'

/** Los mínimos de una persona (propietario o conductor) cuando NO es el tomador. */
export type PersonaForm = {
  dni: string
  nombre: string
  apellido1: string
  apellido2: string
  fechaNacimiento: string
  sexo: '' | 'hombre' | 'mujer'
  estadoCivil: string
  telefono: string
  /** Solo la usa el conductor: es SU carnet, no el del tomador. */
  fechaCarnet: string
}

export const PERSONA_VACIA: PersonaForm = {
  dni: '', nombre: '', apellido1: '', apellido2: '', fechaNacimiento: '', sexo: '', estadoCivil: '', telefono: '', fechaCarnet: '',
}

/** La clave de `correcciones` que lee el puerto para cada papel (igual en auto y en moto). */
export const CLAVE_FIGURA: Record<RolExtra, 'propietario' | 'conductor' | 'conductorOcasional'> = {
  propietario: 'propietario',
  conductor_habitual: 'conductor',
  conductor_ocasional: 'conductorOcasional',
}
export const ROTULO_FIGURA: Record<RolExtra, string> = {
  propietario: 'Propietario',
  conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional',
}
/** Campos de la ficha que se pueden teclear aquí si faltan (`faltanDeFigura` de asegura). */
export const CAMPOS_FIGURA = ['dni', 'nombre', 'apellido1', 'fechaNacimiento', 'sexo', 'telefono', 'fechaCarnet'] as const
export type CampoFigura = (typeof CAMPOS_FIGURA)[number]
export const esCampoFigura = (c: string): c is CampoFigura => (CAMPOS_FIGURA as readonly string[]).includes(c)

/**
 * ¿Se puede cotizar con esta figura? Estado civil elegido (salvo empresa) + lo que falte en su ficha, tecleado.
 * `faltan === null` (no se pudo leer la ficha) solo exige el estado civil: si la ficha no se puede
 * leer, el servidor corta antes de gastar. `ficha` (o un campo que aquí no se teclea) bloquea.
 */
export function figuraCompleta(p: PersonaForm, faltan: string[] | null, empresa = false): boolean {
  // Una empresa no tiene estado civil: el vendor la declara con su CIF (`JuridicalPerson_V1`).
  if (p.estadoCivil === '' && !empresa) return false
  if (faltan === null) return true
  return faltan.every((c) => esCampoFigura(c) && (c === 'sexo' ? p.sexo === 'hombre' || p.sexo === 'mujer' : p[c].trim() !== ''))
}

/** Solo lo tecleado (con valor) + el estado civil: el resto lo pone asegura desde la ficha. */
export function figuraParaPuerto(p: PersonaForm): Record<string, string> {
  const out: Record<string, string> = { estadoCivil: p.estadoCivil }
  for (const k of ['dni', 'nombre', 'apellido1', 'apellido2', 'fechaNacimiento', 'telefono', 'fechaCarnet'] as const) {
    if (p[k].trim() !== '') out[k] = p[k].trim()
  }
  if (p.sexo === 'hombre' || p.sexo === 'mujer') out.sexo = p.sexo
  return out
}

/**
 * Las `correcciones` de las figuras que ocupan OTRA ficha: `propietario` / `conductor` /
 * `conductorOcasional`, cada una con solo lo tecleado + estado civil. Un papel sin ficha no viaja
 * (el servidor pone ahí al tomador). `roles` acota los papeles que admite el ramo (moto: sin ocasional).
 */
export function correccionesDeFiguras(
  figuras: Partial<Record<RolExtra, string>>,
  personas: Record<RolExtra, PersonaForm>,
  roles: readonly RolExtra[],
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const rol of roles) {
    if (figuras[rol]) out[CLAVE_FIGURA[rol]] = figuraParaPuerto(personas[rol])
  }
  return out
}
