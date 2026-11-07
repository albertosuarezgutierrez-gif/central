// CONTRATO «rol general ↔ rol de cada app». PURO, con test (roles.test.ts).
//
// En «Mi empresa» cada miembro tiene UN rol general por empresa (estados.ts: dueno · admin · consulta · empleado) y, si hace
// falta, un rol ESPECÍFICO por herramienta (`miembro_herramienta.rol_app`; NULL = el de por defecto de esta tabla).
// Una herramienta nueva SOLO declara aquí: (1) los roles que entiende su app y (2) su fila de mapeo por defecto.
//
// `null` en el mapeo = «por defecto NO entra en esa app con ese rol general» (p. ej. consulta en contabilidad: la app no tiene
// rol de solo lectura y darle `gestor` le dejaría escribir). El operador puede fijar un rol específico a mano.
// La app destino sigue mandando: este mapeo decide qué se le PIDE por su puerto de operador, no lo que la app concede.
import type { IdHerramienta } from './catalogo.ts'
import type { Rol } from './estados.ts'

/** Roles que entiende cada app (fuente: su código; taller = ROLES_TALLER de module-taller/src/permisos.ts, lo vigila el test). */
export const ROLES_APP = {
  contabilidad: ['dueno', 'gestor'],
  rrhh: ['responsable', 'empleado'],
  taller: ['dueno', 'admin', 'recepcion', 'mecanico'],
} as const
export type AppRoles = keyof typeof ROLES_APP
export type RolApp<A extends AppRoles = AppRoles> = (typeof ROLES_APP)[A][number]

/** Qué tabla de roles usa cada herramienta (nóminas vive en rrhh; el portal de proveedores, en el taller). */
export const APP_DE_ROLES: Record<IdHerramienta, AppRoles> = {
  contabilidad: 'contabilidad', rrhh: 'rrhh', nominas: 'rrhh', taller: 'taller', portal_proveedores: 'taller',
}

/** Mapeo por defecto rol general → rol en la app (EDITABLE: es la única copia). */
export const MAPEO_POR_DEFECTO: { [A in AppRoles]: Record<Rol, RolApp<A> | null> } = {
  contabilidad: { dueno: 'dueno', admin: 'gestor', consulta: null, empleado: null },
  rrhh: { dueno: 'responsable', admin: 'responsable', consulta: null, empleado: 'empleado' },
  taller: { dueno: 'dueno', admin: 'admin', consulta: null, empleado: 'mecanico' },
}

export const esRolApp = (h: IdHerramienta, v: unknown): boolean =>
  typeof v === 'string' && (ROLES_APP[APP_DE_ROLES[h]] as readonly string[]).includes(v)

/**
 * Rol que se pide a la app de `h` para un miembro: el ESPECÍFICO si es válido para esa app; si no, el de por defecto.
 * Nunca se sube a `dueno` en la app a quien no es dueño en Mi empresa (un específico `dueno` de un no-dueño se ignora).
 */
export function rolEnHerramienta(h: IdHerramienta, general: Rol, especifico?: string | null): string | null {
  if (especifico && esRolApp(h, especifico) && (especifico !== 'dueno' || general === 'dueno')) return especifico
  return MAPEO_POR_DEFECTO[APP_DE_ROLES[h]][general] as string | null
}
