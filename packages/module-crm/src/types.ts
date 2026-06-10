// Tipos del módulo CRM (casa de marcas). Agnósticos de vertical y de BD.
// Cada vertical normaliza sus filas de dominio a `Oportunidad` mediante un
// `OportunidadAdapter`, y persiste vía un `OportunidadRepository`. La lógica de
// pipeline (pipeline.ts) opera SOLO sobre estos tipos genéricos.

export type EstadoOportunidad =
  | 'nuevo'
  | 'contactado'
  | 'propuesta'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

// Tipo de entidad de dominio (Encargo) a la que se ancla la oportunidad. Es la "costura"
// que permite reutilizar el CRM en cualquier vertical. Abierto: acepta nuevos tipos.
export type ParentType =
  | 'evento'
  | 'alquiler'
  | 'porte'
  | 'cita_clinica'
  | 'comanda'
  | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export interface Oportunidad {
  id: string
  // Vínculo opcional al Encargo/entidad de dominio que origina o materializa la oportunidad.
  parent?: ParentRef
  clienteNombre: string
  email?: string | null
  telefono?: string | null
  estado: EstadoOportunidad
  valorEstimado?: number | null // € en base imponible
  probabilidadPct?: number | null // 0..100; si null, se deriva del estado (pipeline.ts)
  proximaAccion?: string | null
  proximaAccionFecha?: string | null // ISO date
  coordinadorId?: string | null
  fuente?: string | null // 'web' | 'portal' | 'telefono' | ...
  notas?: string | null
  createdAt: string // ISO
  updatedAt?: string | null // ISO
}

export type NuevaOportunidad = Omit<Oportunidad, 'id' | 'createdAt' | 'updatedAt'>

export interface FiltroOportunidad {
  estados?: EstadoOportunidad[]
  coordinadorId?: string
  parentType?: ParentType
  desde?: string // ISO date (createdAt >=)
  hasta?: string // ISO date (createdAt <=)
}

// PORT de datos: cada vertical implementa el repositorio sobre su propia BD.
export interface OportunidadRepository {
  listar(filtro?: FiltroOportunidad): Promise<Oportunidad[]>
  obtener(id: string): Promise<Oportunidad | null>
  crear(input: NuevaOportunidad): Promise<Oportunidad>
  actualizar(id: string, cambios: Partial<NuevaOportunidad>): Promise<Oportunidad>
  eliminar(id: string): Promise<void>
}

// PORT de adaptación: cada vertical mapea su fila de dominio <-> Oportunidad.
// Ej.: ia-rest implementaría OportunidadAdapter<LeadEventoRow>.
export interface OportunidadAdapter<TDominio> {
  toOportunidad(fila: TDominio): Oportunidad
  fromOportunidad(op: Oportunidad): TDominio
}

// Resumen de pipeline que consume un panel CRM de cualquier vertical.
export interface ResumenPipeline {
  porEstado: Record<EstadoOportunidad, { conteo: number; valor: number }>
  valorPonderado: number // Σ valorEstimado * (probabilidad/100)
  abiertas: number
  ganadasMes: number
}
