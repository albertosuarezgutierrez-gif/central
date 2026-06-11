// @iarest/module-proveedores — Proveedores genéricos de la casa de marcas.
// Catálogo + servicios asignados a un Encargo con comisiones. Cada vertical aporta su
// adaptador. Ver docs/DISENO-modularizacion-verticales.md.

export type {
  ParentType,
  ParentRef,
  EstadoProveedorServicio,
  Proveedor,
  ProveedorServicio,
  ProveedorAdapter,
  ProveedorServicioAdapter,
} from './types'

export { round2, calcularComision, totalComisiones, comisionesCobradas } from './comisiones'
