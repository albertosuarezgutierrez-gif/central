# @iarest/core-identity

Contrato de **identidad** compartido de la casa de marcas. Define los tipos de
sesión/inquilino y el **puerto** `IdentityProvider`, agnósticos del mecanismo de
autenticación de cada app. Así los módulos de `packages/*` se escriben una vez y
funcionan en cualquier vertical (arquitectura **puertos & adaptadores**).

## Idea

```
módulo compartido ──depende de──▶ IdentityProvider (puerto)
                                          ▲
                       implementa │ (adaptador por app)
        ┌─────────────────────────┼─────────────────────────┐
   Supabase Auth (ia.rest)   jose/JWT (IALIMP)        NextAuth (SIVRA)
```

## API

- **Tipos:** `Session<Role>`, `Tenant`, `TenantBranding`, `TenantId`, `UserId`.
- **Puerto:** `IdentityProvider<Role>` con `getSession(): Promise<Session | null>`.
- **Helpers:** `requireSession` (401 si no hay sesión), `requireTenantId` (401/403,
  fuerza scoping multi-tenant), `assertRole` (403), `hasRole` (booleano).
- **Errores:** `UnauthenticatedError` (401), `ForbiddenError` (403), con `.status`.

## Ejemplo de adaptador (IALIMP, jose)

```ts
import type { IdentityProvider, Session } from '@iarest/core-identity'

export const ialimpIdentity: IdentityProvider<'admin' | 'owner' | 'limpiadora'> = {
  async getSession(): Promise<Session<'admin' | 'owner' | 'limpiadora'> | null> {
    const s = await getSession() // helper existente de la app (lib/tenant.ts)
    if (!s) return null
    return { userId: s.userId, tenantId: s.empresa_id, role: s.rol, claims: s }
  },
}
```

Un módulo de cobros/reservas recibe `ialimpIdentity` y llama `requireTenantId(...)`
sin saber que por debajo hay JWT con jose. La misma función sirve en ia.rest con
su adaptador de Supabase.

> Paquete **puro** (sin dependencias). Se consume por código fuente
> (`transpilePackages`), sin paso de build. Verificado por `tsc --noEmit` en CI.
