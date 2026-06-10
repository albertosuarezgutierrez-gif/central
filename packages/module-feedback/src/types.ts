// Tipos del módulo Feedback (casa de marcas). Agnósticos de vertical y de BD.
// Reseñas/valoraciones y propinas, ancladas a un Encargo (parent/parentType) o a un
// token público. La agregación (promedio, totales) vive en logic.ts.

export type ParentType =
  | 'evento'
  | 'porte'
  | 'comanda'
  | 'cita_clinica'
  | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export type EstadoFeedback = 'pendiente' | 'respondido' | (string & {})
export type EstadoPropina = 'pendiente' | 'pagada' | 'cancelada' | (string & {})

export interface Feedback {
  id: string
  token?: string | null
  parent?: ParentRef
  nota: number | null // 1..5
  comentario?: string | null
  estado: EstadoFeedback
  respondidoAt?: string | null
  createdAt?: string | null
}

export interface Propina {
  id: string
  token?: string | null
  parent?: ParentRef
  importe: number
  estado: EstadoPropina
  pagadaAt?: string | null
  createdAt?: string | null
}

export interface ResumenValoraciones {
  conteo: number
  promedio: number
  distribucion: Record<number, number> // nota (1..5) -> conteo
}

export interface FeedbackAdapter<TDominio> {
  toFeedback(fila: TDominio): Feedback
  fromFeedback(f: Feedback): TDominio
}
export interface PropinaAdapter<TDominio> {
  toPropina(fila: TDominio): Propina
  fromPropina(p: Propina): TDominio
}
