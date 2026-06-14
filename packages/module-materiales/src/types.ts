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

// ── Ledger ────────────────────────────────────────────────────

export type TipoMovimiento =
  | 'entrada'        // compra/recepción → +total +disponible
  | 'salida'         // asignación/consumo → -disponible
  | 'devolucion'     // retorno al almacén → +disponible
  | 'rotura'         // baja permanente → -total -disponible
  | 'ajuste'         // corrección inventario físico positiva → +total +disponible
  | 'transferencia'  // cambio de espacio → no afecta totales

export interface Movimiento {
  id: string
  negocioId: string
  materialId: string
  unidadId?: string | null
  tipo: TipoMovimiento
  cantidad: number
  espacioOrigenId?: string | null
  espacioDestinoId?: string | null
  parent?: ParentRef | null
  clienteId?: string | null
  notas?: string | null
  realizadoPor?: string | null
  fecha: string
  createdAt?: string | null
}

// ── Activos serializados ──────────────────────────────────────

export interface UnidadMaterial {
  id: string
  negocioId: string
  materialId: string
  codigoSerie?: string | null
  codigoQr: string
  estado: EstadoMaterial
  espacioActualId?: string | null
  fechaCompra?: string | null
  garantiaHasta?: string | null
  precioCompra?: number | null
  vidaUtilAnios?: number | null
  valorActual?: number | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

// ── Kits ──────────────────────────────────────────────────────

export interface Kit {
  id: string
  negocioId: string
  nombre: string
  descripcion?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface KitItem {
  id: string
  kitId: string
  materialId: string
  cantidad: number
}

// ── Proveedores y Clientes (Fase B) ──────────────────────────

export interface Proveedor {
  id: string
  negocioId: string
  nombre: string
  contacto?: string | null
  telefono?: string | null
  email?: string | null
  nif?: string | null
  plazoEntregaDias?: number | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

export interface ClienteMaterial {
  id: string
  negocioId: string
  nombre: string
  empresa?: string | null
  nif?: string | null
  telefono?: string | null
  email?: string | null
  notas?: string | null
  activo: boolean
  createdAt?: string | null
}

// ── Inventario físico (Fase B) ────────────────────────────────

export interface InventarioFisico {
  id: string
  negocioId: string
  espacioId?: string | null
  realizadoPor?: string | null
  estado: 'borrador' | 'cerrado'
  fecha: string
  createdAt?: string | null
}

export interface InventarioFisicoLinea {
  id: string
  inventarioId: string
  materialId: string
  cantidadSistema: number
  cantidadContada: number
  diferencia: number
  ajusteGenerado: boolean
}

// ── Mantenimiento (Fase B) ────────────────────────────────────

export interface Mantenimiento {
  id: string
  negocioId: string
  materialId: string
  unidadId?: string | null
  tipo: 'preventivo' | 'correctivo' | 'revision'
  estado: 'pendiente' | 'en_curso' | 'completado'
  fechaPrevista?: string | null
  fechaRealizada?: string | null
  coste?: number | null
  notas?: string | null
  createdAt?: string | null
}

// ── Reservas anticipadas (Fase B) ────────────────────────────

export interface ReservaAnticipada {
  id: string
  negocioId: string
  materialId: string
  cantidad: number
  fechaDesde: string
  fechaHasta: string
  parent?: ParentRef | null
  clienteId?: string | null
  estado: 'confirmada' | 'cancelada'
  notas?: string | null
  createdAt?: string | null
}

// ── Adapters nuevos ───────────────────────────────────────────

export interface MovimientoAdapter<TDominio> {
  toMovimiento(fila: TDominio): Movimiento
  fromMovimiento(m: Movimiento): TDominio
}

export interface UnidadMaterialAdapter<TDominio> {
  toUnidad(fila: TDominio): UnidadMaterial
  fromUnidad(u: UnidadMaterial): TDominio
}
