// Adaptador de menaje/materiales: mapea las tablas de ia-rest
// (`inventario_menaje`, `inventario_menaje_evento`, `materiales`) a los
// tipos genéricos de @central/module-materiales.
import type {
  Material,
  AsignacionMaterial,
  MaterialAdapter,
  AsignacionMaterialAdapter,
} from '@central/module-materiales'

// ── inventario_menaje (tabla legacy) ─────────────────────────────────────────

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

export const menajeArticuloAdapter: MaterialAdapter<MenajeRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: '',
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      tipo: 'activo',
      estado: 'operativo',
      cantidadTotal: row.cantidad_total,
      cantidadDisponible: row.cantidad_disponible,
      precioCompra: row.coste_unitario ?? 0,
      costeReposicion: row.coste_unitario ?? 0,
      proveedor: row.proveedor_nombre ? { nombre: row.proveedor_nombre } : null,
      imagenUrl: row.imagen_url,
      activo: row.activo,
      createdAt: row.created_at,
    }
  },
  fromMaterial(m): MenajeRow {
    return {
      id: m.id,
      nombre: m.nombre,
      descripcion: m.descripcion ?? null,
      categoria: m.categoria,
      cantidad_total: m.cantidadTotal,
      cantidad_disponible: m.cantidadDisponible,
      coste_unitario: m.costeReposicion ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      imagen_url: m.imagenUrl ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}

export const menajeAsignacionAdapter: AsignacionMaterialAdapter<MenajeEventoRow> = {
  toAsignacion(row): AsignacionMaterial {
    return {
      id: row.id,
      materialId: row.menaje_id,
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
      evento_id: a.parent?.parentId ?? '',
      menaje_id: a.materialId,
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

// ── materiales (tabla nueva 2026-06-12) ──────────────────────────────────────

export interface MaterialRow {
  id: string
  restaurante_id: string
  nombre: string
  descripcion: string | null
  categoria: string
  tipo: string | null
  estado: string | null
  cantidad_total: number
  cantidad_disponible: number
  stock_minimo: number | null
  espacio_actual_id: string | null
  precio_compra: number | null
  coste_reposicion: number | null
  codigo: string | null
  proveedor_nombre: string | null
  proveedor_referencia: string | null
  proveedor_fecha_compra: string | null
  garantia_hasta: string | null
  documentos: string[] | null
  imagen_url: string | null
  activo: boolean
  created_at: string | null
}

export const materialAdapter: MaterialAdapter<MaterialRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: row.restaurante_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      categoria: row.categoria,
      tipo: (row.tipo as Material['tipo']) ?? 'consumible',
      estado: (row.estado as Material['estado']) ?? 'operativo',
      cantidadTotal: row.cantidad_total,
      cantidadDisponible: row.cantidad_disponible,
      stockMinimo: row.stock_minimo,
      espacioActualId: row.espacio_actual_id,
      precioCompra: row.precio_compra ?? 0,
      costeReposicion: row.coste_reposicion ?? 0,
      codigo: row.codigo,
      proveedor: row.proveedor_nombre != null ? {
        nombre: row.proveedor_nombre,
        referencia: row.proveedor_referencia,
        fechaCompra: row.proveedor_fecha_compra,
      } : null,
      garantiaHasta: row.garantia_hasta,
      documentos: row.documentos,
      imagenUrl: row.imagen_url,
      activo: row.activo,
      createdAt: row.created_at,
    }
  },
  fromMaterial(m): MaterialRow {
    return {
      id: m.id,
      restaurante_id: m.negocioId,
      nombre: m.nombre,
      descripcion: m.descripcion ?? null,
      categoria: m.categoria,
      tipo: m.tipo,
      estado: m.estado,
      cantidad_total: m.cantidadTotal,
      cantidad_disponible: m.cantidadDisponible,
      stock_minimo: m.stockMinimo ?? null,
      espacio_actual_id: m.espacioActualId ?? null,
      precio_compra: m.precioCompra,
      coste_reposicion: m.costeReposicion,
      codigo: m.codigo ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      proveedor_referencia: m.proveedor?.referencia ?? null,
      proveedor_fecha_compra: m.proveedor?.fechaCompra ?? null,
      garantia_hasta: m.garantiaHasta ?? null,
      documentos: m.documentos ?? null,
      imagen_url: m.imagenUrl ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}
