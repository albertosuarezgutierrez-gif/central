// Acceso por rol, SIEMPRE con el taller de la sesión (la cookie firmada lleva tallerId).
// El rol de la cookie no basta: se re-comprueba en BD que el usuario sigue activo, con ese rol y con la MISMA versión de sesión
// (una baja, un cambio de rol, o cambiar/resetear el PIN corta el acceso sin esperar a que caduque la cookie).

import { rolesDeFila } from '@central/module-taller'

/** `sv` = versión de sesión que llevaba la cookie al entrar. */
export type Acceso = { tallerId: string; usuarioId: string; rol: string; sv?: number }

type FilaAcceso = { rol: string; roles?: string[]; capacidadesExtra?: string[]; activo: boolean; debeCambiarPin?: boolean; sesionVersion?: number }
type TxUsuario = { usuarioTaller: { findFirst(a: unknown): Promise<FilaAcceso | null> } }

export const SELECT_ACCESO = { rol: true, roles: true, capacidadesExtra: true, activo: true, debeCambiarPin: true, sesionVersion: true } as const

/** ¿La versión de la cookie es la vigente? (cookie y fila sin versión = 0 = coinciden; una cookie real siempre trae número). */
export const sesionVigente = (s: Acceso, u: { sesionVersion?: number }) => (s.sv ?? 0) === (u.sesionVersion ?? 0)

/** El usuario de la sesión si SIGUE siendo válido (activo, mismo taller, misma versión de sesión); si no, null. */
export async function usuarioDeSesion(tx: TxUsuario, s: Acceso): Promise<FilaAcceso | null> {
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: SELECT_ACCESO })
  return u && u.activo && sesionVigente(s, u) ? u : null
}

/** true solo si el usuario existe en ESE taller, está activo, con sesión vigente y ALGUNO de sus roles está entre los permitidos.
 * Para permisos usa `exigir(capacidad)` (lib/permisos.ts): esto queda para comprobaciones de rol explícitas. */
export async function usuarioConRol(tx: TxUsuario, s: Acceso, roles: readonly string[]): Promise<boolean> {
  const u = await usuarioDeSesion(tx, s)
  return !!u && u.debeCambiarPin !== true && rolesDeFila(u).some((r) => roles.includes(r))
}

/** ¿Tiene que elegir PIN propio antes de seguir? (PIN temporal de alta o de reset). */
export async function debeCambiarPin(tx: TxUsuario, s: Acceso): Promise<boolean> {
  const u = await usuarioDeSesion(tx, s)
  return !!u && u.debeCambiarPin === true
}
