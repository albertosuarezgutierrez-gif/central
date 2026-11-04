// @central/module-taller — dominio PURO del taller de vehículos (spec docs/superpowers/specs/2026-11-04-taller-global2.md).
// Sin BD, sin secretos, sin LLM. La app (apps/taller) aporta los adaptadores y el SQL del schema `taller` (apps/taller/prisma/sql).

export * from './config.ts'
export { configDeAlta } from './defaults.ts'
export * from './dinero.ts'
export * from './presupuesto.ts'
export * from './ot.ts'
export * from './partes.ts'
export * from './consentimiento.ts'
export * from './avisos.ts'
export * from './matricula.ts'
