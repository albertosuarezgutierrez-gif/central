// Permisos por CAPACIDAD, aplicados en SERVIDOR: cada acción y cada página llama a `exigir`/`conPermiso(capacidad)`, que
// RE-LEE en BD los roles de la persona, sus capacidades extra y la config de capacidades por rol de SU taller (la cookie
// no basta) y lanza `SinPermisoError`. La UI solo esconde botones; esto es lo que protege.
// Tabla por defecto (decisión de Alberto, 04/11/2026) y reglas (dueño = todo; «ajustes», «usuarios», «pedidos_enviar» solo
// del dueño; al menos un dueño activo) en `@central/module-taller` src/permisos.ts. Editable por el dueño en Ajustes (0014).
//
// OT: `ordenes_avanzar` = en_curso → terminado y terminado → entregado; el resto de cambios de estado a mano exige
// `ordenes_gestionar`.
import { SELECT_ACCESO, sesionVigente, usuarioDeSesion, type Acceso } from './acceso.ts'
import {
  CAPACIDADES, capacidadesDe, rolesDeFila, rolPrincipal, type Capacidad,
} from '@central/module-taller'

// La tabla de capacidades por rol, los roles múltiples y las reservadas al dueño viven en el módulo PURO (src/permisos.ts).
// Desde 0014 (07/11/2026): permisos = unión de los roles de la persona (con la config de SU taller) + sus capacidades extra.
export { CAPACIDADES, type Capacidad }

/**
 * Compatibilidad: ¿el rol (o los roles) tiene la capacidad con la config POR DEFECTO? Las pantallas NO deben usarlo: usan
 * `c.capacidades` (la config real del taller, re-leída en BD por `exigir`).
 */
export function tienePermiso(rol: string | readonly string[] | null | undefined, cap: Capacidad, capacidadesPorRol: unknown = null): boolean {
  const roles = typeof rol === 'string' ? [rol] : Array.isArray(rol) ? rol : []
  return capacidadesDe({ roles }, capacidadesPorRol).has(cap)
}

export class SinPermisoError extends Error {
  readonly capacidad: Capacidad
  constructor(capacidad: Capacidad) {
    super(`Sin permiso: ${capacidad}`)
    this.name = 'SinPermisoError'
    this.capacidad = capacidad
  }
}

/** Transiciones de OT que SÍ puede hacer recepción (además del dueño). Todo lo demás: solo `ordenes_gestionar`. */
export const TRANSICIONES_RECEPCION: readonly (readonly [string, string])[] = [['en_curso', 'terminado'], ['terminado', 'entregado']]

/** Capacidad que exige un cambio de estado concreto. */
export const capacidadParaTransicion = (desde: string, hacia: string): Capacidad =>
  TRANSICIONES_RECEPCION.some(([d, h]) => d === desde && h === hacia) ? 'ordenes_avanzar' : 'ordenes_gestionar'

/** La cookie lleva una versión de sesión que ya no es la del usuario (cambió o reseteó el PIN): hay que volver a entrar. */
export class SesionObsoletaError extends Error {
  constructor() {
    super('Sesión obsoleta')
    this.name = 'SesionObsoletaError'
  }
}

/** El PIN es temporal (alta o reset): hasta que elija uno propio, no entra en nada más. */
export class DebeCambiarPinError extends Error {
  constructor() {
    super('Debes cambiar tu PIN temporal')
    this.name = 'DebeCambiarPinError'
  }
}

type FilaRol = { rol: string; roles?: string[]; capacidadesExtra?: string[]; activo: boolean; debeCambiarPin?: boolean; sesionVersion?: number }
type TxRol = {
  usuarioTaller: { findFirst(a: unknown): Promise<FilaRol | null> }
  configuracion?: { findFirst(a: unknown): Promise<{ capacidadesPorRol?: unknown } | null> }
}

/** Lo que el servidor sabe del acceso tras re-leer la BD. */
export type AccesoVigente = { rol: string; roles: string[]; capacidades: ReadonlySet<Capacidad> }

/** Config de capacidades por rol del taller (NULL / sin fila = valores por defecto del módulo). */
export async function capacidadesPorRolDe(tx: TxRol, tallerId: string): Promise<unknown> {
  if (!tx.configuracion) return null
  const c = await tx.configuracion.findFirst({ where: { tallerId }, select: { capacidadesPorRol: true } })
  return c?.capacidadesPorRol ?? null
}

const vigente = async (tx: TxRol, tallerId: string, f: FilaRol): Promise<AccesoVigente> => {
  const roles = rolesDeFila(f)
  const capacidades = capacidadesDe({ roles, capacidadesExtra: f.capacidadesExtra ?? [] }, await capacidadesPorRolDe(tx, tallerId))
  return { rol: rolPrincipal(roles) ?? f.rol, roles, capacidades }
}

/** Rol PRINCIPAL vigente en BD (usuario activo del taller de la sesión, con la misma versión de sesión) o null. */
export async function rolVigente(tx: TxRol, s: Acceso): Promise<string | null> {
  const u = await usuarioDeSesion(tx, s)
  return u ? rolPrincipal(rolesDeFila(u)) : null
}

/** Capacidades vigentes del usuario de la sesión (null = sin sesión válida). Para menús; NO sustituye a `exigir`. */
export async function capacidadesDeSesion(tx: TxRol, s: Acceso): Promise<AccesoVigente | null> {
  const u = await usuarioDeSesion(tx, s)
  return u ? vigente(tx, s.tallerId, u) : null
}

/** Devuelve el acceso vigente si tiene la capacidad; si no, lanza. Roles y config del taller RE-LEÍDOS en BD. */
export async function exigirAcceso(tx: TxRol, s: Acceso, cap: Capacidad): Promise<AccesoVigente> {
  const f = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: SELECT_ACCESO })
  // Usuario activo pero con OTRA versión de sesión (PIN cambiado/reseteado): la cookie vieja ya no vale → a entrar de nuevo.
  if (f && f.activo && !sesionVigente(s, f)) throw new SesionObsoletaError()
  const u = f && f.activo ? f : null
  const a = u ? await vigente(tx, s.tallerId, u) : null
  if (!a || !a.capacidades.has(cap)) throw new SinPermisoError(cap)
  if (u?.debeCambiarPin === true) throw new DebeCambiarPinError()
  return a
}

/** Devuelve el rol principal si tiene la capacidad; si no, lanza. */
export async function exigir(tx: TxRol, s: Acceso, cap: Capacidad): Promise<string> {
  return (await exigirAcceso(tx, s, cap)).rol
}
