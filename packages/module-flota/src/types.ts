// Tipos del módulo Flota/Transporte (casa de marcas). Agnósticos de vertical y de BD.
// Origen: extracción de la flota a medida de ia-rest (`vehiculos_grupo` + `evento_transporte`)
// hacia un módulo portable. Cada vertical normaliza sus filas de dominio a estos tipos mediante
// un `VehiculoAdapter`/`PorteAdapter`, y la lógica (flota.ts) opera SOLO sobre los genéricos.
// La "costura" parent/parentType ancla un porte a cualquier Encargo (evento, pedido, alquiler…).

export type TipoVehiculo =
  | 'furgon'
  | 'camion'
  | 'frigorifico'
  | 'plataforma'
  | 'turismo'
  | (string & {})

export interface Vehiculo {
  id: string
  cuentaId: string // holding al que pertenece (scope multi-tenant)
  nombre: string
  matricula: string
  tipo: TipoVehiculo
  capacidadKg?: number | null
  capacidadM3?: number | null
  esPropio: boolean // true = flota propia; false = transportista subcontratado
  proveedorTransporte?: string | null
  tarifaKm?: number | null // € por km recorrido
  tarifaFija?: number | null // € fijos por porte (p. ej. salida)
  activo: boolean
}

// Tipo de Encargo al que se ancla el porte. Abierto: acepta nuevos tipos sin tocar el módulo.
export type ParentType = 'evento' | 'pedido' | 'alquiler' | 'porte' | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export type EstadoPorte = 'planificado' | 'en_curso' | 'completado' | 'cancelado'

export interface Porte {
  id: string
  // Encargo que origina el porte (evento de catering, pedido de alquiler de material…).
  parent?: ParentRef
  vehiculoId: string
  conductorId?: string | null
  estado: EstadoPorte
  kmEstimados?: number | null
  kmReales?: number | null
  costeEstimado?: number | null // si null, se deriva de km × tarifa (flota.ts)
  costeReal?: number | null // idem
  importeFacturado?: number | null // lo cobrado por el porte (cliente externo o intercompany)
  horaSalida?: string | null // ISO
  horaLlegada?: string | null // ISO
  // Costura intercompany (holding): un porte interno mueve mercancía entre sociedades del grupo.
  esInterno?: boolean
  sociedadOrigenId?: string | null
  sociedadDestinoId?: string | null
}

export type TipoParada = 'recogida' | 'entrega'

export interface ParadaRuta {
  id: string
  porteId: string
  orden: number
  nodoId: string // dirección/almacén/hacienda
  tipo: TipoParada
  ventanaInicio?: string | null // ISO
  ventanaFin?: string | null // ISO
  completadaAt?: string | null // ISO
}

export type TipoDocumentoVehiculo = 'itv' | 'seguro' | 'permiso' | 'tacografo' | (string & {})

export interface DocumentoVehiculo {
  id: string
  vehiculoId: string
  tipo: TipoDocumentoVehiculo
  fechaEmision?: string | null // ISO date
  fechaCaducidad: string // ISO date
  importe?: number | null
  documentoUrl?: string | null
}

export interface Mantenimiento {
  id: string
  vehiculoId: string
  fecha: string // ISO date
  km?: number | null
  tipo: string // 'revision' | 'neumaticos' | 'averia' | …
  coste: number
  taller?: string | null
  notas?: string | null
}

export interface Repostaje {
  id: string
  vehiculoId: string
  fecha: string // ISO date
  km?: number | null
  litros: number
  importe: number
}

// Carga a transportar (para la asignación inteligente de vehículo).
export interface Carga {
  pesoKg?: number | null
  volumenM3?: number | null
  tipoRequerido?: TipoVehiculo | null // p. ej. 'frigorifico' para producto refrigerado
}

export interface Intervalo {
  inicio: string // ISO
  fin: string // ISO
}

// ── Resultados de la lógica de flota ──────────────────────────────────────────

export interface RentabilidadPorte {
  costeEstimado: number
  costeReal: number
  desviacionCoste: number // real − estimado (>0 = más caro de lo previsto)
  desviacionKm: number // kmReales − kmEstimados
  importeFacturado: number
  margen: number // facturado − costeReal
  margenPct: number // 0 si no hay facturación
}

export interface RentabilidadVehiculo {
  vehiculoId: string
  nPortes: number
  kmTotales: number
  ingresos: number // Σ importeFacturado (interno + externo)
  costeOperativo: number // Σ repostajes + Σ mantenimientos del periodo
  margen: number // ingresos − costeOperativo
  margenPct: number
  costePorKm: number // costeOperativo / kmTotales (0 si no hay km)
}

export type EstadoDocumento = 'vigente' | 'por_caducar' | 'caducado'

export interface AlertaDocumento {
  documentoId: string
  vehiculoId: string
  tipo: TipoDocumentoVehiculo
  fechaCaducidad: string
  estado: EstadoDocumento
  diasParaCaducar: number // <0 si ya caducó
}

// ── Puertos de adaptación (cada vertical mapea su fila de dominio ↔ genérico) ──

export interface VehiculoAdapter<TDominio> {
  toVehiculo(fila: TDominio): Vehiculo
  fromVehiculo(v: Vehiculo): TDominio
}

export interface PorteAdapter<TDominio> {
  toPorte(fila: TDominio): Porte
  fromPorte(p: Porte): TDominio
}
