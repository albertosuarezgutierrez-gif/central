// @iarest/core-identity — contrato de identidad para la casa de marcas.
//
// Puerto + tipos agnósticos del mecanismo de auth (Supabase, jose/JWT, NextAuth).
// Los módulos de packages/* dependen de ESTE contrato, no del auth de cada app;
// cada app aporta un adaptador que implementa `IdentityProvider`. Multi-tenant:
// usa `requireTenantId` para forzar el scoping por inquilino en cada query.
// Ver docs/HANDOFF-unificacion-casa-marcas.md (Fase 1).

export type { Session, Tenant, TenantBranding, TenantId, UserId } from './types'
export { UnauthenticatedError, ForbiddenError } from './errors'
export type { IdentityProvider } from './port'
export { requireSession, requireTenantId, assertRole, hasRole } from './port'
