// @central/module-materiales — Materiales genéricos de la casa de marcas.
// Catálogo de activos físicos y consumibles + espacios + transferencias +
// contabilidad de compra/roturas. Agnóstico de vertical y de BD.
// Cada vertical aporta adaptadores (MaterialAdapter/EspacioAdapter/…).

export type {
  TipoMaterial,
  EstadoMaterial,
  ParentType,
  ParentRef,
  EstadoAsignacion,
  Material,
  Espacio,
  AsignacionMaterial,
  TransferenciaMaterial,
  ResumenStock,
  ResumenContable,
  MaterialAdapter,
  EspacioAdapter,
  AsignacionMaterialAdapter,
  TransferenciaAdapter,
} from './types'

export {
  round2,
  disponibilidadTrasReserva,
  disponibilidadTrasDevolucion,
  costeDanos,
  valorStock,
  resumenStock,
  gastoCompras,
  resumenContable,
  puedeTransferir,
  alertasStockMinimo,
} from './stock'
