// Tipos del módulo Inventario (casa de marcas). Agnósticos de vertical y de BD.
// Un `Articulo` es una pieza de catálogo con stock; una `AsignacionActivo` reserva/entrega
// unidades de un artículo a un Encargo de cualquier tipo (la costura parent/parentType).

// Tipo de Encargo al que se asigna el activo (misma idea que en module-crm). Abierto.
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

export type EstadoAsignacion =
  | 'reservado'
  | 'entregado'
  | 'devuelto'
  | 'cerrado'
  | (string & {})

export interface Articulo {
  id: string
  nombre: string
  descripcion?: string | null
  categoria: string
  cantidadTotal: number
  cantidadDisponible: number
  costeUnitario?: number | null
  proveedorNombre?: string | null
  imagenUrl?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface AsignacionActivo {
  id: string
  articuloId: string
  parent: ParentRef
  cantidadReservada: number
  cantidadDevuelta?: number | null
  cantidadDanada?: number | null
  costeDanos?: number | null
  estado: EstadoAsignacion
  notas?: string | null
  createdAt?: string | null
}

export interface ResumenStock {
  articulos: number
  unidadesTotales: number
  unidadesDisponibles: number
  unidadesComprometidas: number // total - disponible
  valorTotal: number // Σ cantidadTotal * costeUnitario
}

// PORTs de adaptación: cada vertical mapea su fila de dominio <-> tipo genérico.
export interface ArticuloAdapter<TDominio> {
  toArticulo(fila: TDominio): Articulo
  fromArticulo(a: Articulo): TDominio
}
export interface AsignacionAdapter<TDominio> {
  toAsignacion(fila: TDominio): AsignacionActivo
  fromAsignacion(a: AsignacionActivo): TDominio
}
