// @central/module-inventario — Inventario genérico de la casa de marcas.
// Catálogo de artículos + asignación de activos a un Encargo (evento/porte/alquiler/cita)
// vía parent/parentType. Cada vertical aporta su adaptador. Ver
// docs/DISENO-modularizacion-verticales.md y docs/DISENO-modulos-materiales-flota.md.

export type {
  ParentType,
  ParentRef,
  EstadoAsignacion,
  Articulo,
  AsignacionActivo,
  ResumenStock,
  ArticuloAdapter,
  AsignacionAdapter,
} from './types'

export {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
} from './stock'
