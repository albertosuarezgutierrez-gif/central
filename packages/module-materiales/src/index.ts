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
  // Ledger
  TipoMovimiento,
  Movimiento,
  UnidadMaterial,
  Kit,
  KitItem,
  Proveedor,
  ClienteMaterial,
  InventarioFisico,
  InventarioFisicoLinea,
  Mantenimiento,
  ReservaAnticipada,
  // Adapters
  MaterialAdapter,
  EspacioAdapter,
  AsignacionMaterialAdapter,
  TransferenciaAdapter,
  MovimientoAdapter,
  UnidadMaterialAdapter,
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
  // Ledger
  stockActualDesdeLedger,
  stockPorEspacio,
  disponibilidadEnFecha,
  expandirKit,
  calcularDepreciacion,
  alertasVencimiento,
  ajusteInventario,
} from './stock'
