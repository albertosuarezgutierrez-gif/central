// Tipos del módulo Presupuestos (casa de marcas). Agnósticos de vertical y de BD.
// Cada vertical mapea su tarificación de dominio (p.ej. precio_adulto/_nino de catering,
// €/km de transporte, €/día de alquiler) a `LineaPresupuesto` genéricas vía un adaptador.

export type ParentType =
  | 'evento'
  | 'porte'
  | 'alquiler'
  | 'cita_clinica'
  | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export type EstadoPresupuesto =
  | 'borrador'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | (string & {})

export interface LineaPresupuesto {
  concepto: string
  cantidad: number
  unidad?: string
  precioUnitario: number
  categoria?: string // 'ingredientes' | 'servicios' | 'otros' | ...
}

export interface CosteLinea {
  concepto: string
  importe: number
  categoria?: string
}

export interface Descuento {
  tipo?: string
  porcentaje: number // 0..100
}

export interface Margen {
  costeTotal: number
  margenImporte: number
  margenPct: number
  rentable: boolean
}

export interface Presupuesto {
  id?: string
  parent?: ParentRef
  lineas: LineaPresupuesto[]
  costes: CosteLinea[]
  descuento?: Descuento | null
  estado: EstadoPresupuesto
}

export interface ResumenPresupuesto {
  subtotalBruto: number // Σ líneas
  descuentoImporte: number
  subtotalNeto: number // bruto - descuento
  margen: Margen
}

// PORT de adaptación: cada vertical mapea su fila de dominio <-> Presupuesto.
export interface PresupuestoAdapter<TDominio> {
  toPresupuesto(fila: TDominio): Presupuesto
  fromPresupuesto(p: Presupuesto): TDominio
}
