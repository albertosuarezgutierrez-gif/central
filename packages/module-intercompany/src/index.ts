// @central/module-intercompany — consolidación con eliminación de operaciones vinculadas.
// El gancho diferencial de un holding: cocina central → tiendas, flota → catering, materiales →
// eventos se facturan entre sociedades del mismo grupo; este módulo las elimina del consolidado
// para no inflar el agregado y dar el resultado REAL del grupo + el detalle por sociedad.
// Lógica pura (tipos + puerto de adaptación); cada vertical aporta su adaptador de operaciones.
// Ver docs/DISENO-modularizacion-verticales.md §7.

export type {
  ParentType,
  ParentRef,
  OperacionIntercompany,
  ResumenSociedad,
  Totales,
  DetalleSociedadConsolidado,
  ResultadoConsolidado,
  OperacionAdapter,
} from './types'

export {
  round2,
  esIntercompany,
  operacionesInternas,
  totalIntercompany,
  consolidar,
} from './consolidar'
