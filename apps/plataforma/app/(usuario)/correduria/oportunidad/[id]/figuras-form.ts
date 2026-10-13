// Las FIGURAS de una variante en las pantallas de pedir precio (auto-nuevo, moto-nuevo), 29/09/2026.
// Con la figura en OTRA ficha, sus datos los pone asegura desde esa ficha. Aquí solo se pide lo
// que la ficha no trae en forma de compañía: el estado civil (catálogo del vendor) y lo que falte.
// PURO (sin React): lo comparten `AutoNuevo.tsx` y `MotoNuevo.tsx`, y lo cubre `figuras-form.test.ts`.

import { esRolMultiple, maxDelRol, type RolFigura } from '@central/module-seguros'
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

/**
 * Cómo se rellena un papel en la pantalla de pedir precio (10/10/2026, «una sola fuente de verdad: la oportunidad»):
 * - `ficha`: lo ocupa OTRA ficha del riesgo (`oportunidad_figura`): sale de su ficha; aquí solo las condiciones.
 * - `riesgo`: hay riesgo y el papel NO tiene figura: lo ocupa el tomador del riesgo. Otra persona se ASIGNA en
 *   «Intervinientes» del riesgo (con «+ Nueva persona»), nunca se teclea suelta aquí: lo tecleado viajaba al vendor
 *   pero no quedaba en la oportunidad ni en la foto de figuras de la variante.
 * - `libre`: tarificación suelta, sin riesgo (`?oportunidad=` ausente): como siempre, casilla «es otra persona».
 */
export function modoPapel(rol: RolExtra, figuras: Partial<Record<RolExtra, string>>, conRiesgo: boolean): 'ficha' | 'riesgo' | 'libre' {
  if (figuras[rol]) return 'ficha'
  return conRiesgo ? 'riesgo' : 'libre'
}

// ─── Papeles de VARIAS personas (asegurados), 10/10/2026 ────────────────────
// Salud/decesos: varios asegurados; hogar/vida/comercio: uno. Cada uno es una FICHA (cliente_id) y se agrupa por
// ese id: dos personas que se llaman igual son dos; la misma ficha no sale dos veces. La cardinalidad la da
// `cardinalidadesDelRamo` de `@central/module-seguros` (la misma que usa el puerto de asegura).

/** Los papeles del riesgo que son de UNA persona (las tarjetas de siempre) y los de VARIAS (lista). */
export function repartirRoles(roles: readonly RolFigura[]): { unicos: RolFigura[]; multiples: RolFigura[] } {
  return { unicos: roles.filter((r) => !esRolMultiple(r)), multiples: roles.filter((r) => esRolMultiple(r)) }
}

/** Las fichas de un papel múltiple, una por `clienteId` (identidad), en el orden en que llegan. */
export function personasDelRol<F extends { rol: RolFigura; clienteId: string }>(figuras: readonly F[], rol: RolFigura): F[] {
  const vistos = new Set<string>()
  const out: F[] = []
  for (const f of figuras) {
    if (f.rol !== rol || vistos.has(f.clienteId)) continue
    vistos.add(f.clienteId)
    out.push(f)
  }
  return out
}

/** A quién se puede añadir: las opciones que AÚN no están en el papel (por id, nunca por nombre). */
export function opcionesSinPoner<O extends { clienteId: string }>(opciones: readonly O[], puestas: readonly { clienteId: string }[]): O[] {
  const ya = new Set(puestas.map((p) => p.clienteId))
  return opciones.filter((o) => !ya.has(o.clienteId))
}

/** ¿Cabe otro en el papel? El tope es el del ramo. */
export function cabeOtro(ramo: string, rol: RolFigura, puestas: number): boolean {
  return puestas < maxDelRol(ramo, rol)
}

/**
 * Qué hace la pantalla con los papeles múltiples según asegura:
 * - `disponible` → se puede añadir y quitar.
 * - `sin_migracion` → «pendiente de migración» (sin botones: escribir fallaría).
 * - `desconocido`, o un asegura que aún no lo dice (`undefined`/`null`) → «no se ha podido comprobar» (tampoco se
 *   escribe: un dato que no se ha mirado no autoriza a ofrecer el botón).
 */
export function estadoBloqueMulti(v: unknown): { editable: true } | { editable: false; pendienteMigracion: boolean; texto: string } {
  if (v === 'disponible') return { editable: true }
  if (v === 'sin_migracion') {
    return {
      editable: false, pendienteMigracion: true,
      texto: 'Pendiente de migración: los asegurados con ficha llegarán cuando se aplique la actualización de la base de datos. Mientras, siguen como hasta ahora en los datos del riesgo.',
    }
  }
  return { editable: false, pendienteMigracion: false, texto: 'No se ha podido comprobar si los asegurados con ficha están disponibles. Recarga en un rato.' }
}
