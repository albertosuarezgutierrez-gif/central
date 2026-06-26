// Tipos del agregado genérico ENCARGO (casa de marcas). Agnóstico de vertical y de BD.
// "La pieza central" de la modularización (ver docs/DISENO-modularizacion-verticales.md §3): un
// evento de catering, un porte de camión, un alquiler de material o una cita de clínica son el
// MISMO patrón con otra piel. El Encargo une las capacidades (CRM, presupuestos, agenda,
// inventario, proveedores, portal, feedback, flota, intercompany) bajo una identidad común con
// una máquina de estados. Cada módulo se cuelga del Encargo por su `id` (la costura parent/parentType
// de los demás módulos apunta aquí). No importa a ningún otro módulo: solo referencia ids.

export type TipoEncargo =
  | 'evento'
  | 'porte'
  | 'alquiler'
  | 'cita'
  | 'comanda'
  | (string & {})

export type Vertical = 'ia-rest' | 'transporte' | 'materiales' | 'clinica' | (string & {})

export type EstadoEncargo =
  | 'borrador'
  | 'presupuestado'
  | 'confirmado'
  | 'en_curso'
  | 'completado'
  | 'cancelado'

// Componentes (módulos) que pueden colgar de un Encargo.
export type ComponenteEncargo =
  | 'oportunidad' // module-crm
  | 'presupuesto' // module-presupuestos
  | 'reserva' // module-agenda
  | 'activos' // module-inventario / module-materiales
  | 'proveedores' // module-proveedores
  | 'portes' // module-flota
  | 'portal' // module-portales
  | 'feedback' // module-feedback

// Enlaces a las entidades de cada módulo (por id; sin acoplar tipos entre módulos).
export interface EnlacesEncargo {
  oportunidadId?: string | null
  presupuestoId?: string | null
  recursoReservaId?: string | null
  asignacionesActivo?: string[] // ids de AsignacionActivo / AsignacionMaterial
  proveedores?: string[] // ids de ProveedorServicio
  porteIds?: string[] // ids de Porte (module-flota)
  portalId?: string | null
  feedbackId?: string | null
}

export interface Encargo {
  id: string
  tipo: TipoEncargo
  vertical: Vertical
  estado: EstadoEncargo
  titulo?: string | null
  clienteNombre?: string | null
  fechaInicio?: string | null // ISO
  fechaFin?: string | null // ISO
  importeTotal?: number | null // € (normalmente del presupuesto)
  enlaces?: EnlacesEncargo
  createdAt: string // ISO
  updatedAt?: string | null // ISO
}

export type NuevoEncargo = Omit<Encargo, 'id' | 'createdAt' | 'updatedAt'>

export interface FiltroEncargo {
  estados?: EstadoEncargo[]
  tipo?: TipoEncargo
  vertical?: Vertical
  desde?: string // ISO (createdAt >=)
  hasta?: string // ISO (createdAt <=)
}

export interface ResumenEncargos {
  porEstado: Record<EstadoEncargo, number>
  porTipo: Record<string, number>
  abiertos: number
  completadosMes: number
  valorAbierto: number // Σ importeTotal de los abiertos
}

// PORT de datos: cada vertical implementa el repositorio sobre su BD.
export interface EncargoRepository {
  listar(filtro?: FiltroEncargo): Promise<Encargo[]>
  obtener(id: string): Promise<Encargo | null>
  crear(input: NuevoEncargo): Promise<Encargo>
  actualizar(id: string, cambios: Partial<NuevoEncargo>): Promise<Encargo>
  eliminar(id: string): Promise<void>
}

// PORT de adaptación: cada vertical mapea su fila de dominio ↔ Encargo.
export interface EncargoAdapter<TDominio> {
  toEncargo(fila: TDominio): Encargo
  fromEncargo(e: Encargo): TDominio
}
