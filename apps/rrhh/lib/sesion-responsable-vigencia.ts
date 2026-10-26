// Vigencia de la sesión del RESPONSABLE en el servidor (revisión del 26/10/2026). Las sesiones duran 30 o 90 días
// («Recordar este dispositivo»), así que el JWT solo no basta: en CADA petición se mira en BD que
//   1. `usuarios_rrhh.session_jti` sigue siendo el del token (sesión única; «Salir» lo ROTA a un valor aleatorio), y
//   2. la empresa del token sigue en `rrhh.usuario_empresas` para ese usuario (retirarla corta el acceso al momento).
// 🚨 `session_jti` NULL (tokens anteriores o fila rara) = NO vale: se vuelve a entrar. Un NULL nunca es «cualquiera».
// 🚨 Fail-CLOSED ante la BD (lo decide `lib/tenant.ts`): un error de la consulta se propaga, no se convierte en «vale».
// Puro + puerto para testearlo sin Prisma; el adaptador real está en `lib/tenant.ts`.
import type { Sesion } from '@/lib/auth'

/** Fila leída para (usuario, empresa del token); `null` = el usuario ya no existe. */
export type EstadoSesionResponsable = { session_jti: string | null; empresa_autorizada: boolean }

export interface RepoSesionResponsable {
  estadoSesion(usuario_id: string, empresa_id: string): Promise<EstadoSesionResponsable | null>
  /** Cambia `session_jti` a `nuevo` SOLO si sigue siendo `actual` (no tumba una sesión más nueva de otro dispositivo). */
  rotarJti(usuario_id: string, actual: string, nuevo: string): Promise<void>
}

export type MotivoRechazo = 'usuario_inexistente' | 'jti_nulo' | 'sesion_cerrada' | 'empresa_retirada'

/** `null` = vigente; si no, por qué no. */
export function motivoRechazoSesion(s: Pick<Sesion, 'jti'>, fila: EstadoSesionResponsable | null): MotivoRechazo | null {
  if (!fila) return 'usuario_inexistente'
  if (!fila.session_jti) return 'jti_nulo'
  if (fila.session_jti !== s.jti) return 'sesion_cerrada'
  if (!fila.empresa_autorizada) return 'empresa_retirada'
  return null
}

/** «Salir»: invalida el token EN EL SERVIDOR rotando el jti a uno aleatorio nuevo (nunca a NULL). */
export async function revocarSesionResponsable(repo: RepoSesionResponsable, s: Pick<Sesion, 'usuario_id' | 'jti'>): Promise<void> {
  await repo.rotarJti(s.usuario_id, s.jti, crypto.randomUUID())
}
