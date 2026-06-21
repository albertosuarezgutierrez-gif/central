import type { Session, TenantId } from './types'
import { UnauthenticatedError, ForbiddenError } from './errors'

/**
 * Puerto de identidad (arquitectura puertos & adaptadores).
 *
 * Cada app provee un adaptador que implementa esta interfaz resolviendo la
 * sesión desde el contexto de la petición (cookie, header, etc.):
 *   - ia.rest → Supabase Auth
 *   - IALIMP  → JWT (jose) con cookies `ialimp_session` / `ialimp_prop`
 *   - SIVRA   → NextAuth + cookie de limpiadora
 *
 * Los módulos compartidos reciben este puerto y NO conocen el auth concreto.
 */
export interface IdentityProvider<Role extends string = string> {
  /** Devuelve la sesión normalizada o `null` si no hay autenticación válida. */
  getSession(): Promise<Session<Role> | null>
}

/** Como `getSession` pero lanza `UnauthenticatedError` (401) si no hay sesión. */
export async function requireSession<Role extends string>(
  provider: IdentityProvider<Role>,
): Promise<Session<Role>> {
  const session = await provider.getSession()
  if (!session) throw new UnauthenticatedError()
  return session
}

/**
 * Garantiza que la sesión tiene inquilino activo y lo devuelve. Lanza 401 si no
 * hay sesión y 403 si la sesión no está asociada a ningún inquilino. Pensado
 * para forzar el scoping multi-tenant en TODA query (frontera de seguridad/RGPD).
 */
export async function requireTenantId<Role extends string>(
  provider: IdentityProvider<Role>,
): Promise<TenantId> {
  const session = await requireSession(provider)
  if (!session.tenantId) throw new ForbiddenError('Sesión sin inquilino')
  return session.tenantId
}

/** Verifica que la sesión tiene uno de los roles dados; si no, lanza 403. */
export function assertRole<Role extends string>(
  session: Session<Role>,
  ...allowed: Role[]
): void {
  if (!allowed.includes(session.role)) {
    throw new ForbiddenError(`Rol '${session.role}' no autorizado`)
  }
}

/** Variante funcional de `assertRole`: devuelve true/false sin lanzar. */
export function hasRole<Role extends string>(
  session: Session<Role>,
  ...allowed: Role[]
): boolean {
  return allowed.includes(session.role)
}
