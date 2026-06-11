// Adaptador de proveedores de evento: mapea `proveedores_evento_asignaciones` al modelo
// genérico de @iarest/module-proveedores (ProveedorServicio), reutilizando el cálculo de
// comisiones. La asignación cuelga del Encargo vía parent={evento}.
import type {
  EstadoProveedorServicio,
  ProveedorServicio,
  ProveedorServicioAdapter,
} from '@iarest/module-proveedores'

// Mapeo de estado dominio -> genérico (el dominio usa 'comision_cobrada').
const A_GENERICO: Record<string, EstadoProveedorServicio> = {
  pendiente: 'pendiente',
  confirmado: 'confirmado',
  pagado: 'pagado',
  comision_cobrada: 'cobrada',
}
export function estadoProvAGenerico(e: string | null | undefined): EstadoProveedorServicio {
  return A_GENERICO[e ?? ''] ?? 'pendiente'
}

export interface ProveedorAsignacionRow {
  id: string
  evento_id: string
  proveedor_id: string
  servicio_descripcion: string | null
  importe: number | null
  comision_pct: number | null
  comision_importe: number | null
  iva_tipo: number | null
  estado: string | null
  confirmado_proveedor_at: string | null
  comision_cobrada_at: string | null
}

export const proveedorServicioAdapter: ProveedorServicioAdapter<ProveedorAsignacionRow> = {
  toServicio(row): ProveedorServicio {
    return {
      id: row.id,
      parent: { parentId: row.evento_id, parentType: 'evento' },
      proveedorId: row.proveedor_id,
      descripcion: row.servicio_descripcion,
      importe: row.importe ?? 0,
      comisionPct: row.comision_pct ?? 0,
      comisionImporte: row.comision_importe ?? 0,
      ivaTipo: row.iva_tipo,
      estado: estadoProvAGenerico(row.estado),
      confirmadoAt: row.confirmado_proveedor_at,
      cobradaAt: row.comision_cobrada_at,
    }
  },
  fromServicio(s): ProveedorAsignacionRow {
    return {
      id: s.id,
      evento_id: s.parent.parentId,
      proveedor_id: s.proveedorId,
      servicio_descripcion: s.descripcion ?? null,
      importe: s.importe,
      comision_pct: s.comisionPct,
      comision_importe: s.comisionImporte,
      iva_tipo: s.ivaTipo ?? null,
      estado: s.estado === 'cobrada' ? 'comision_cobrada' : s.estado,
      confirmado_proveedor_at: s.confirmadoAt ?? null,
      comision_cobrada_at: s.cobradaAt ?? null,
    }
  },
}
