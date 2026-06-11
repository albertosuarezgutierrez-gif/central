// Adapter de inventario para ialimp → @central/module-inventario
//
// Mapea dos conceptos distintos:
//   productos_stock → Articulo  (catálogo operativo con stock_actual)
//   stock_consumos  → AsignacionActivo  (consumo de producto en una sesión)
//
// Nota: kits_limpiadoras (asignación permanente de producto a limpiadora) es un
// concepto de dominio propio de ialimp — NO mapea a AsignacionActivo (que modela
// una reserva temporal para un Encargo). kits queda fuera del módulo a propósito.
import type {
  Articulo,
  ArticuloAdapter,
  AsignacionActivo,
  AsignacionAdapter,
  ResumenStock,
} from '@central/module-inventario'
export { resumenStock, valorStock, disponibilidadTrasReserva } from '@central/module-inventario'
export type { ResumenStock }

export interface ProductoStockRow {
  id: string
  empresa_id: string
  nombre: string
  categoria: string
  unidad?: string | null
  stock_actual: number
  stock_minimo: number
  precio_unitario: number | null
  proveedor_id?: string | null
  proveedor_nombre?: string | null
  activo: boolean
  created_at?: string | null
}

export interface StockConsumoRow {
  id: string
  empresa_id?: string
  session_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number | null
  created_at: string | null
}

export const articuloAdapter: ArticuloAdapter<ProductoStockRow> = {
  toArticulo(row): Articulo {
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: null,
      categoria: row.categoria,
      // ialimp no distingue unidades reservadas vs disponibles:
      // se asume todo el stock como disponible (no hay reservas previas).
      cantidadTotal: row.stock_actual,
      cantidadDisponible: row.stock_actual,
      costeUnitario: row.precio_unitario ?? null,
      proveedorNombre: row.proveedor_nombre ?? null,
      imagenUrl: null,
      activo: row.activo,
      createdAt: row.created_at ?? null,
    }
  },
  fromArticulo(a: Articulo): ProductoStockRow {
    return {
      id: a.id,
      empresa_id: '',
      nombre: a.nombre,
      categoria: a.categoria,
      stock_actual: a.cantidadTotal,
      stock_minimo: 0,
      precio_unitario: a.costeUnitario ?? null,
      activo: a.activo,
      created_at: a.createdAt ?? null,
    }
  },
}

export const asignacionAdapter: AsignacionAdapter<StockConsumoRow> = {
  toAsignacion(row): AsignacionActivo {
    return {
      id: row.id,
      articuloId: row.producto_id,
      // Mapeamos session_id como parentId con parentType propio de ialimp.
      parent: { parentId: row.session_id, parentType: 'sesion_limpieza' },
      cantidadReservada: row.cantidad,
      cantidadDevuelta: null,
      cantidadDanada: null,
      costeDanos: null,
      // En ialimp el consumo es siempre definitivo (no se devuelven materiales).
      estado: 'entregado',
      notas: null,
      createdAt: row.created_at ?? null,
    }
  },
  fromAsignacion(a: AsignacionActivo): StockConsumoRow {
    return {
      id: a.id,
      session_id: a.parent.parentId,
      producto_id: a.articuloId,
      cantidad: a.cantidadReservada,
      precio_unitario: null,
      created_at: a.createdAt ?? null,
    }
  },
}
