export type MesaEstado = 'libre' | 'activa' | 'marchar' | 'aviso' | 'urgente' | 'cuenta'
export type ComandaEstado = 'nueva' | 'en_cocina' | 'lista' | 'entregada' | 'cancelada'
export type ItemEstado = 'pendiente' | 'en_proceso' | 'listo'

export interface Mesa {
  id: string
  codigo: string
  zona: string
  capacidad: number
  estado: MesaEstado
  camarero_id: string | null
  camarero?: Camarero
  ocupada_desde: string | null
  ultima_comanda: string | null
  updated_at: string
}

export interface Camarero {
  id: string
  nombre: string
  pin: string
  activo: boolean
  created_at: string
}

export interface Turno {
  id: string
  nombre: string
  fecha: string
  estado: 'activo' | 'cerrado'
  created_at: string
}

export interface Comanda {
  id: string
  mesa_id: string
  mesa?: Mesa
  camarero_id: string
  camarero?: Camarero
  turno_id: string
  estado: ComandaEstado
  tipo: 'comanda' | 'cuenta' | 'marchar' | '86' | 'aviso'
  numero_ticket: number
  items?: ComandaItem[]
  created_at: string
  updated_at: string
}

export interface ComandaItem {
  id: string
  comanda_id: string
  nombre: string
  cantidad: number
  notas: string | null
  estado: ItemEstado
  created_at: string
}

export interface Transcripcion {
  id: string
  camarero_id: string
  camarero?: Camarero
  turno_id: string
  texto_original: string
  texto_brain: BrainResult | null
  latencia_ms: number | null
  comanda_id: string | null
  created_at: string
}

export interface BrainResult {
  mesa: string
  tipo: 'comanda' | 'marchar' | '86' | 'cuenta' | 'aviso'
  items: { nombre: string; cantidad: number; notas?: string; producto_id?: string; precio_unitario?: number }[]
  confianza: number
  raw: string
}

export interface Producto86 {
  id: string
  nombre: string
  turno_id: string
  created_at: string
}
