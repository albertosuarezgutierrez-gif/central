// Acceso por rol, SIEMPRE con el taller de la sesión (la cookie firmada lleva tallerId).
// El rol de la cookie no basta: se re-comprueba en BD que el usuario sigue activo y con ese rol
// (una baja o un cambio de rol corta el acceso sin esperar a que caduque la cookie).

export type Acceso = { tallerId: string; usuarioId: string; rol: string }

type TxUsuario = { usuarioTaller: { findFirst(a: unknown): Promise<{ rol: string; activo: boolean; debeCambiarPin?: boolean } | null> } }

/** true solo si el usuario existe en ESE taller, está activo y su rol está entre los permitidos. */
export async function usuarioConRol(tx: TxUsuario, s: Acceso, roles: readonly string[]): Promise<boolean> {
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: { rol: true, activo: true, debeCambiarPin: true } })
  return !!u && u.activo && u.debeCambiarPin !== true && roles.includes(u.rol)
}

/** ¿Tiene que elegir PIN propio antes de seguir? (PIN temporal de alta o de reset). */
export async function debeCambiarPin(tx: TxUsuario, s: Acceso): Promise<boolean> {
  const u = await tx.usuarioTaller.findFirst({ where: { tallerId: s.tallerId, id: s.usuarioId }, select: { rol: true, activo: true, debeCambiarPin: true } })
  return !!u && u.activo && u.debeCambiarPin === true
}
