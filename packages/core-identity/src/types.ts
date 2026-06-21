/**
 * Tipos del contrato de identidad (casa de marcas).
 *
 * Son agnósticos del mecanismo de autenticación: una sesión producida por
 * Supabase Auth (ia.rest), por JWT/jose (IALIMP) o por NextAuth (SIVRA) se
 * normaliza a este mismo contrato. Los módulos de `packages/*` dependen de
 * estos tipos, nunca del auth concreto de una app.
 */

/** Identificador opaco de inquilino (empresa/tenant) en un SaaS multi-tenant. */
export type TenantId = string

/** Identificador opaco de usuario. */
export type UserId = string

/**
 * Sesión autenticada y normalizada.
 *
 * @typeParam Role  Unión de roles de la app (p. ej. `'admin' | 'limpiadora'`).
 * @typeParam Extra Datos del adaptador (email, jti…) sin contaminar el contrato.
 */
export interface Session<Role extends string = string, Extra = Record<string, unknown>> {
  /** Usuario autenticado. */
  userId: UserId
  /**
   * Inquilino activo. `null` para apps de un solo tenant o sesiones globales
   * (p. ej. superadmin). En multi-tenant, TODA query debe filtrar por él.
   */
  tenantId: TenantId | null
  /** Rol dentro del inquilino (admin, owner, limpiadora, propietario…). */
  role: Role
  /** Claims extra del adaptador, opacos para los módulos compartidos. */
  claims?: Extra
}

/** Marca de un inquilino (white-label / casa de marcas). */
export interface TenantBranding {
  name?: string
  logoUrl?: string
  colorPrimary?: string
  colorSecondary?: string
  colorLight?: string
}

/** Metadatos de un inquilino. */
export interface Tenant {
  id: TenantId
  name: string
  /** Marca para white-label; los módulos de UI la consumen. */
  branding?: TenantBranding
}

// ── Jerarquía de cuenta (HITO 2: Cuenta → Sociedad → Negocio) ────────────

/**
 * Sector de un negocio. La lista es abierta (enchufable).
 * Los valores conocidos son los 3 existentes; cualquier string válido es aceptado.
 */
export type Sector = 'hosteleria' | 'limpieza' | 'inmobiliario' | (string & {})

/** El dueño — persona o empresa que tiene la cuenta en la plataforma. */
export interface Cuenta {
  id: string
  nombre: string
  email: string
}

/**
 * Empresa o CIF bajo una cuenta.
 * Adaptable: puede ser 1 solo CIF o varias empresas separadas.
 */
export interface Sociedad {
  id: string
  cuentaId: string
  nombre: string
  cif?: string
}

/**
 * Unidad operativa de un sector (negocio, local, finca…).
 * `refExt` = ID en la app vertical (empresa_id en ialimp/sivra, local_id en ia.rest).
 * `app` = qué vertical lo gestiona.
 */
export interface Negocio {
  id: string
  sociedadId: string
  nombre: string
  sector: Sector
  refExt?: string
  app?: 'ia-rest' | 'ialimp' | 'sivra' | (string & {})
}

/** Sesión de cuenta (plataforma). Distinta de `Session` (sesión de vertical). */
export interface CuentaSession {
  cuentaId: string
  email: string
}
