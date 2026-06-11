// Adaptador de inventario de menaje: mapea las tablas de dominio de ia-rest
// (`inventario_menaje` y `inventario_menaje_evento`) a los tipos genéricos de
// @iarest/module-inventario. La asignación a evento usa la costura parent={evento},
// reutilizable por otras verticales (alquiler de materiales, transporte…).
import type {
  Articulo,
  AsignacionActivo,
  ArticuloAdapter,
  AsignacionAdapter,
} from '@iarest/module-inventario'

export interface MenajeRow {
  id: string
  nombre: string
  descripcion: string | null
  categoria: string
  cantidad_total: number
  cantidad_disponible: number
  coste_unitario: number | null
  proveedor_nombre: string | null
  imagen_url: string | null
  activo: boolean
  created_at: string | null
}

export interface MenajeEventoRow {
  id: string
  evento_id: string
  menaje_id: string
  cantidad_reservada: number
  cantidad_devuelta: number | null
  cantidad_rota: number | null
  coste_roturas: number | null
  estado: string
  notas: string | null
  created_at: string | null
}

export const menajeArticuloAdapter: ArticuloAdapter<MenajeRow> = {
  toArticulo(row): Articulo {
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      cantidadTotal: row.cantidad_total,
      cantidadDisponible: row.cantidad_disponible,
      costeUnitario: row.coste_unitario,
      proveedorNombre: row.proveedor_nombre,
      imagenUrl: row.imagen_url,
      activo: row.activo,
      createdAt: row.created_at,
    }
  },
  fromArticulo(a): MenajeRow {
    return {
      id: a.id,
      nombre: a.nombre,
      descripcion: a.descripcion ?? null,
      categoria: a.categoria,
      cantidad_total: a.cantidadTotal,
      cantidad_disponible: a.cantidadDisponible,
      coste_unitario: a.costeUnitario ?? null,
      proveedor_nombre: a.proveedorNombre ?? null,
      imagen_url: a.imagenUrl ?? null,
      activo: a.activo,
      created_at: a.createdAt ?? null,
    }
  },
}

export const menajeAsignacionAdapter: AsignacionAdapter<MenajeEventoRow> = {
  toAsignacion(row): AsignacionActivo {
    return {
      id: row.id,
      articuloId: row.menaje_id,
      parent: { parentId: row.evento_id, parentType: 'evento' },
      cantidadReservada: row.cantidad_reservada,
      cantidadDevuelta: row.cantidad_devuelta,
      cantidadDanada: row.cantidad_rota,
      costeDanos: row.coste_roturas,
      estado: row.estado,
      notas: row.notas,
      createdAt: row.created_at,
    }
  },
  fromAsignacion(a): MenajeEventoRow {
    return {
      id: a.id,
      evento_id: a.parent.parentId,
      menaje_id: a.articuloId,
      cantidad_reservada: a.cantidadReservada,
      cantidad_devuelta: a.cantidadDevuelta ?? null,
      cantidad_rota: a.cantidadDanada ?? null,
      coste_roturas: a.costeDanos ?? null,
      estado: a.estado,
      notas: a.notas ?? null,
      created_at: a.createdAt ?? null,
    }
  },
}
