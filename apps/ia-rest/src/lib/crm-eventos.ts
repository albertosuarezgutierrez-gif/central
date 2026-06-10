// Adaptador CRM de eventos: mapea filas de `leads_evento` (dominio de hostelería/eventos)
// al modelo genérico `Oportunidad` de @iarest/module-crm, para reutilizar su lógica de
// pipeline. La "costura" parent = { evento_id } permite que el mismo CRM sirva a otras
// verticales (transporte, alquiler de materiales, clínica…) sin tocar el módulo.
import type { EstadoOportunidad, Oportunidad, OportunidadAdapter } from '@iarest/module-crm'

// Estados de dominio en ia-rest (columna `leads_evento.estado`).
export type EstadoLeadEvento =
  | 'nuevo'
  | 'contactado'
  | 'presupuesto_enviado'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

export const ESTADOS_LEAD_EVENTO: EstadoLeadEvento[] = [
  'nuevo',
  'contactado',
  'presupuesto_enviado',
  'negociacion',
  'ganado',
  'perdido',
]

// Mapeo dominio <-> genérico (solo difiere 'presupuesto_enviado' <-> 'propuesta').
const A_GENERICO: Record<EstadoLeadEvento, EstadoOportunidad> = {
  nuevo: 'nuevo',
  contactado: 'contactado',
  presupuesto_enviado: 'propuesta',
  negociacion: 'negociacion',
  ganado: 'ganado',
  perdido: 'perdido',
}
const A_DOMINIO: Record<EstadoOportunidad, EstadoLeadEvento> = {
  nuevo: 'nuevo',
  contactado: 'contactado',
  propuesta: 'presupuesto_enviado',
  negociacion: 'negociacion',
  ganado: 'ganado',
  perdido: 'perdido',
}

export function estadoAGenerico(e: string): EstadoOportunidad {
  return A_GENERICO[e as EstadoLeadEvento] ?? 'nuevo'
}
export function estadoADominio(e: EstadoOportunidad): EstadoLeadEvento {
  return A_DOMINIO[e]
}

// Fila mínima de `leads_evento` que consume el adaptador (las columnas que mapea).
export interface LeadEventoRow {
  id: string
  coordinador_id: string | null
  nombre_cliente: string
  email: string | null
  telefono: string | null
  estado: string
  probabilidad_pct: number | null
  presupuesto_cliente: number | null
  proxima_accion: string | null
  proxima_accion_fecha: string | null
  notas: string | null
  evento_id: string | null
  origen: string | null
  created_at: string
  updated_at: string | null
}

export const leadsEventoAdapter: OportunidadAdapter<LeadEventoRow> = {
  toOportunidad(row): Oportunidad {
    return {
      id: row.id,
      parent: row.evento_id ? { parentId: row.evento_id, parentType: 'evento' } : undefined,
      clienteNombre: row.nombre_cliente,
      email: row.email,
      telefono: row.telefono,
      estado: estadoAGenerico(row.estado),
      valorEstimado: row.presupuesto_cliente,
      probabilidadPct: row.probabilidad_pct,
      proximaAccion: row.proxima_accion,
      proximaAccionFecha: row.proxima_accion_fecha,
      coordinadorId: row.coordinador_id,
      fuente: row.origen,
      notas: row.notas,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  },
  fromOportunidad(op): LeadEventoRow {
    return {
      id: op.id,
      coordinador_id: op.coordinadorId ?? null,
      nombre_cliente: op.clienteNombre,
      email: op.email ?? null,
      telefono: op.telefono ?? null,
      estado: estadoADominio(op.estado),
      probabilidad_pct: op.probabilidadPct ?? null,
      presupuesto_cliente: op.valorEstimado ?? null,
      proxima_accion: op.proximaAccion ?? null,
      proxima_accion_fecha: op.proximaAccionFecha ?? null,
      notas: op.notas ?? null,
      evento_id: op.parent?.parentId ?? null,
      origen: op.fuente ?? null,
      created_at: op.createdAt,
      updated_at: op.updatedAt ?? null,
    }
  },
}
