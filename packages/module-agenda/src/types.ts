// Tipos del módulo Agenda (casa de marcas). Agnósticos de vertical y de BD.
// Un `Recurso` (hacienda, vehículo, kit, sala, persona) se reserva en intervalos para un
// Encargo (parent/parentType). La detección de solapes vive en logic.ts.

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

export type TipoRecurso =
  | 'hacienda'
  | 'vehiculo'
  | 'kit_material'
  | 'sala'
  | 'persona'
  | (string & {})

export type EstadoReserva = 'tentativa' | 'confirmada' | 'cancelada' | (string & {})

export interface Recurso {
  id: string
  nombre: string
  tipo: TipoRecurso
  capacidad?: number | null
  activo: boolean
}

/** Intervalo temporal [inicio, fin) en ISO 8601. */
export interface Intervalo {
  inicio: string
  fin: string
}

export interface Reserva {
  id: string
  recursoId: string
  parent?: ParentRef
  inicio: string
  fin: string
  estado: EstadoReserva
  notas?: string | null
}

export interface RecursoAdapter<TDominio> {
  toRecurso(fila: TDominio): Recurso
  fromRecurso(r: Recurso): TDominio
}
export interface ReservaAdapter<TDominio> {
  toReserva(fila: TDominio): Reserva
  fromReserva(r: Reserva): TDominio
}
