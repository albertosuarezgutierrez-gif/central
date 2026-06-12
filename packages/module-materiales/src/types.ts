// Tipos del módulo Materiales (casa de marcas). Agnósticos de vertical y de BD.
// Un Material es cualquier activo físico o consumible con ciclo de vida (compra →
// asignación a espacio/encargo → transferencia → baja/rotura). La costura
// negocioId + ParentRef permite anclarlo a cualquier jerarquía de negocio.

export type TipoMaterial = 'consumible' | 'activo'

export type EstadoMaterial =
  | 'operativo'
  | 'deteriorado'
  | 'en_reparacion'
  | 'baja'

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

export interface Material {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  categoria: string
  tipo: TipoMaterial
  estado: EstadoMaterial
  cantidadTotal: number
  cantidadDisponible: number
  stockMinimo?: number | null
  espacioActualId?: string | null
  precioCompra: number
  costeReposicion: number
  codigo?: string | null
  proveedor?: {
    nombre?: string | null
    referencia?: string | null
    fechaCompra?: string | null
  } | null
  garantiaHasta?: string | null
  documentos?: string[] | null
  imagenUrl?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface Espacio {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  tipo: string
  refTipo?: string | null
  refId?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface AsignacionMaterial {
  id: string
  materialId: string
  espacioId?: string | null
  parent?: ParentRef | null
  cantidadReservada: number
  cantidadDevuelta?: number | null
  cantidadDanada?: number | null
  costeDanos?: number | null
  estado: EstadoAsignacion
  notas?: string | null
  createdAt?: string | null
}

export interface TransferenciaMaterial {
  id: string
  materialId: string
  espacioOrigenId: string
  espacioDestinoId: string
  cantidad: number
  fecha: string
  nota?: string | null
  realizadoPor?: string | null
  createdAt?: string | null
}

export interface ResumenStock {
  materiales: number
  unidadesTotales: number
  unidadesDisponibles: number
  unidadesComprometidas: number
  valorTotal: number
}

export interface ResumenContable {
  gastoCompras: number
  gastoRoturas: number
  valorInventario: number
  totalMateriales: number
  totalActivos: number
  totalConsumibles: number
}

// PORTs de adaptación: cada vertical mapea su fila de dominio <-> tipo genérico.
export interface MaterialAdapter<TDominio> {
  toMaterial(fila: TDominio): Material
  fromMaterial(m: Material): TDominio
}
export interface EspacioAdapter<TDominio> {
  toEspacio(fila: TDominio): Espacio
  fromEspacio(e: Espacio): TDominio
}
export interface AsignacionMaterialAdapter<TDominio> {
  toAsignacion(fila: TDominio): AsignacionMaterial
  fromAsignacion(a: AsignacionMaterial): TDominio
}
export interface TransferenciaAdapter<TDominio> {
  toTransferencia(fila: TDominio): TransferenciaMaterial
  fromTransferencia(t: TransferenciaMaterial): TDominio
}
