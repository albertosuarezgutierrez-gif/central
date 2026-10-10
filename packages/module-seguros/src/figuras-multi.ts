/**
 * Figuras de VARIAS personas en un riesgo (fase 2 del riesgo unificado, 10/10/2026; diseño
 * docs/superpowers/specs/2026-10-10-riesgo-unificado-todos-los-ramos-design.md, H2/H3).
 *
 * Decisiones de Alberto: los asegurados de salud/decesos son FICHAS con rol `asegurado` (alta ligera: nombre,
 * nacimiento y sexo; el DNI se pide al emitir); los beneficiarios de vida son texto, no figura.
 *
 * Puro, sin BD. Lo usan el puerto de asegura (decidir antes de escribir) y la pantalla de plataforma.
 *
 * - Identidad: una figura es un `cliente_id`. Dos fichas distintas son dos personas aunque se llamen igual; la
 *   misma ficha no entra dos veces en el mismo papel. Nunca se casa por nombre.
 * - Gate: el SQL `2026-10-10_figuras_multi.sql` puede no estar aplicado. Sin él, el rol `asegurado` choca con el
 *   check viejo y el segundo asegurado con el único viejo: la pantalla dice «pendiente de migración».
 */
import { normalizarDni, normalizarFechaNacimiento, normalizarNombre } from './cliente-edicion.ts'
import { esRolMultiple, maxDelRol, type RolFigura } from './variantes-riesgo.ts'

/** Nombres que pone el SQL de la migración: si cambian allí, cambian aquí (y el test lo vigila). */
export const INDICE_FIGURA_ROL_UNICO = 'oportunidad_figura_rol_unico_uq'
export const INDICE_FIGURA_MULTI = 'oportunidad_figura_multi_uq'
export const INDICE_FIGURA_VIEJO = 'oportunidad_figura_rol_uq'

/**
 * `disponible` = migración aplicada · `sin_migracion` = la tabla está como el 29/09 · `desconocido` = no se pudo
 * mirar (un `catch` NO autoriza a decir «sin migración» ni «disponible»).
 */
export type EstadoFigurasMulti = 'disponible' | 'sin_migracion' | 'desconocido'

/** Lo que el puerto lee del catálogo de Postgres. `null` = la consulta falló. */
export type CatalogoFiguras = {
  /** `pg_get_constraintdef` del check `oportunidad_figura_rol_ck`; `null` = no existe. */
  checkRoles: string | null
  indices: readonly string[]
}

export function estadoFigurasMulti(c: CatalogoFiguras | null): EstadoFigurasMulti {
  if (c === null) return 'desconocido'
  const check = c.checkRoles ?? ''
  const aplicada =
    /'asegurado'/.test(check) &&
    c.indices.includes(INDICE_FIGURA_ROL_UNICO) &&
    c.indices.includes(INDICE_FIGURA_MULTI) &&
    !c.indices.includes(INDICE_FIGURA_VIEJO)
  return aplicada ? 'disponible' : 'sin_migracion'
}

/** ¿Este papel necesita la migración para escribirse? Solo los de varias personas. */
export function rolNecesitaMigracion(rol: RolFigura): boolean {
  return esRolMultiple(rol)
}

export type DecisionFigura =
  | { ok: true; yaEstaba: boolean }
  | { ok: false; motivo: 'rol_no_del_ramo' | 'lleno'; max: number }

/**
 * ¿Se puede poner esta ficha en este papel de un rol MÚLTIPLE? `actuales` = las fichas que ya lo ocupan.
 * La misma ficha ya puesta → `yaEstaba` (idempotente, no se duplica). Otra ficha → se añade si cabe, aunque se
 * llame igual que una que ya está (dos personas distintas no se funden).
 */
export function decidirFiguraMultiple(e: { ramo: string; rol: RolFigura; actuales: readonly string[]; clienteId: string }): DecisionFigura {
  const max = maxDelRol(e.ramo, e.rol)
  if (max === 0) return { ok: false, motivo: 'rol_no_del_ramo', max }
  if (e.actuales.includes(e.clienteId)) return { ok: true, yaEstaba: true }
  if (new Set(e.actuales).size >= max) return { ok: false, motivo: 'lleno', max }
  return { ok: true, yaEstaba: false }
}

export type AseguradoLigero = {
  nombre: string
  apellidos: string
  fechaNacimiento: string
  sexo: 'hombre' | 'mujer'
  /** Opcional en el alta ligera (se pide al emitir). Si viene, identifica: la misma ficha de ese DNI. */
  dni: string | null
}

/**
 * Alta ligera de un asegurado: nombre, fecha de nacimiento y sexo obligatorios; apellidos y DNI opcionales.
 * Sin DNI no hay forma de reconocer a la persona: SIEMPRE ficha nueva (nunca se reutiliza otra por nombre).
 */
export function revisarAseguradoLigero(
  e: Record<string, unknown>,
  hoy = new Date(),
): { ok: true; valor: AseguradoLigero } | { ok: false; motivo: string; campo: string } {
  const nombre = normalizarNombre(e.nombre, 'nombre')
  if (!nombre.ok) return { ok: false, motivo: nombre.motivo, campo: 'nombre' }
  let apellidos = ''
  if (typeof e.apellidos === 'string' && e.apellidos.trim() !== '') {
    const a = normalizarNombre(e.apellidos, 'apellidos')
    if (!a.ok) return { ok: false, motivo: a.motivo, campo: 'apellidos' }
    apellidos = a.valor
  }
  const nac = normalizarFechaNacimiento(e.fechaNacimiento, hoy)
  if (!nac.ok) return { ok: false, motivo: nac.motivo, campo: 'fechaNacimiento' }
  if (e.sexo !== 'hombre' && e.sexo !== 'mujer') return { ok: false, motivo: 'Falta el sexo.', campo: 'sexo' }
  let dni: string | null = null
  if (typeof e.dni === 'string' && e.dni.trim() !== '') {
    const d = normalizarDni(e.dni)
    if (!d.ok) return { ok: false, motivo: d.motivo, campo: 'dni' }
    if (d.valor.tipoPersona !== 'fisica') return { ok: false, motivo: 'Un asegurado es una persona: ese documento es de empresa.', campo: 'dni' }
    dni = d.valor.valor
  }
  return { ok: true, valor: { nombre: nombre.valor, apellidos, fechaNacimiento: nac.valor, sexo: e.sexo, dni } }
}
