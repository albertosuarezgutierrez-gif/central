// Adapter de CRM/leads para ialimp → @iarest/module-crm
//
// Mapea la tabla `leads` de ialimp (con sus 6 estados propios) a Oportunidad.
// Estados: ialimp.propuesta_enviada → módulo.propuesta
//          ialimp.presupuestado    → módulo.negociacion
// Los demás estados son compatibles 1:1.
import type {
  Oportunidad,
  EstadoOportunidad,
  OportunidadAdapter,
  ResumenPipeline,
} from '@iarest/module-crm'
export { resumenPipeline, valorPonderado } from '@iarest/module-crm'
export type { ResumenPipeline }

type EstadoLead = 'nuevo' | 'contactado' | 'propuesta_enviada' | 'presupuestado' | 'ganado' | 'perdido'

const ESTADO_A_MODULO: Record<EstadoLead, EstadoOportunidad> = {
  nuevo:             'nuevo',
  contactado:        'contactado',
  propuesta_enviada: 'propuesta',
  presupuestado:     'negociacion',
  ganado:            'ganado',
  perdido:           'perdido',
}

const ESTADO_A_IALIMP: Record<EstadoOportunidad, EstadoLead> = {
  nuevo:       'nuevo',
  contactado:  'contactado',
  propuesta:   'propuesta_enviada',
  negociacion: 'presupuestado',
  ganado:      'ganado',
  perdido:     'perdido',
}

export interface LeadRow {
  id: string
  empresa_id: string
  nombre: string
  email: string | null
  telefono: string | null
  zona: string | null
  tipo_servicio: string | null
  m2: number | null
  precio_estimado: number | null
  estado: string
  notas: string | null
  propuesta_url: string | null
  propuesta_ia_at: string | null
  seguimiento_at: string | null
  creado_at: string
}

export const oportunidadAdapter: OportunidadAdapter<LeadRow> = {
  toOportunidad(row): Oportunidad {
    return {
      id: row.id,
      clienteNombre: row.nombre,
      email: row.email ?? null,
      telefono: row.telefono ?? null,
      estado: ESTADO_A_MODULO[row.estado as EstadoLead] ?? 'nuevo',
      valorEstimado: row.precio_estimado ?? null,
      probabilidadPct: null,
      proximaAccion: null,
      proximaAccionFecha: null,
      coordinadorId: null,
      fuente: 'web',
      notas: row.notas ?? null,
      createdAt: row.creado_at,
      updatedAt: row.seguimiento_at ?? row.propuesta_ia_at ?? null,
    }
  },
  fromOportunidad(op: Oportunidad): LeadRow {
    return {
      id: op.id,
      empresa_id: '',
      nombre: op.clienteNombre,
      email: op.email ?? null,
      telefono: op.telefono ?? null,
      zona: null,
      tipo_servicio: null,
      m2: null,
      precio_estimado: op.valorEstimado ?? null,
      estado: ESTADO_A_IALIMP[op.estado] ?? 'nuevo',
      notas: op.notas ?? null,
      propuesta_url: null,
      propuesta_ia_at: null,
      seguimiento_at: op.updatedAt ?? null,
      creado_at: op.createdAt,
    }
  },
}
