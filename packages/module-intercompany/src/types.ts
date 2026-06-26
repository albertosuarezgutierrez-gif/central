// Tipos del módulo Intercompany (casa de marcas). Agnósticos de vertical y de BD.
// Problema que resuelve: un holding (Cuenta → Sociedades → Negocios) que factura ENTRE sus
// propias sociedades (cocina central → tiendas, flota → catering, alquiler de materiales →
// eventos) infla el consolidado si se suman ingresos y gastos sin más: el mismo dinero se cuenta
// dos veces (ingreso en la sociedad A = gasto en la sociedad B → neto 0 a nivel grupo). Este
// módulo modela esas operaciones vinculadas y las ELIMINA en el consolidado.
// La "costura" parent/parentType permite trazar de qué Encargo viene cada operación
// (un porte de @central/module-flota, un alquiler de @central/module-materiales, un lote de cocina…).

export type ParentType = 'porte' | 'alquiler' | 'lote_cocina' | 'evento' | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

// Una operación entre dos partes. Si origen y destino son sociedades del MISMO holding, es
// intercompany y se elimina en el consolidado. `importe` es la base (sin IVA) que el emisor
// factura al receptor: ingreso para `sociedadOrigenId`, gasto para `sociedadDestinoId`.
export interface OperacionIntercompany {
  id: string
  sociedadOrigenId: string // quien factura / vende (registra el INGRESO)
  sociedadDestinoId: string // quien recibe / compra (registra el GASTO)
  importe: number
  concepto?: string | null
  fecha?: string | null // ISO date
  tipo?: string | null // 'cocina' | 'flota' | 'materiales' | …
  parent?: ParentRef // Encargo que la origina (trazabilidad)
}

// Cifras brutas de una sociedad del holding (lo que cada negocio/vertical reporta).
export interface ResumenSociedad {
  sociedadId: string
  ingresos: number
  gastos: number
}

export interface Totales {
  ingresos: number
  gastos: number
  resultado: number // ingresos − gastos
}

export interface DetalleSociedadConsolidado {
  sociedadId: string
  ingresos: number
  gastos: number
  resultado: number
  // Parte de sus cifras que es interna al holding (se elimina en el agregado):
  ingresosIntercompany: number // facturado a otras sociedades del grupo
  gastosIntercompany: number // comprado a otras sociedades del grupo
}

export interface ResultadoConsolidado {
  porSociedad: DetalleSociedadConsolidado[]
  agregadoBruto: Totales // suma simple (lo que se hace hoy sin eliminar)
  eliminaciones: { ingresos: number; gastos: number } // total intercompany eliminado
  consolidado: Totales // agregado − eliminaciones (el resultado REAL del grupo)
}

// PORT de adaptación: cada vertical mapea su fila de dominio ↔ OperacionIntercompany.
export interface OperacionAdapter<TDominio> {
  toOperacion(fila: TDominio): OperacionIntercompany
  fromOperacion(op: OperacionIntercompany): TDominio
}
