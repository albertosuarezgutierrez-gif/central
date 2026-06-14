// Adapter de inventario para ialimp → @central/module-materiales
//
// Mapea:
//   productos_stock → Material  (catálogo operativo)
//   stock_consumos  → AsignacionMaterial  (consumo en una sesión de limpieza)
//
// kits_limpiadoras (asignación permanente) NO mapea aquí — es dominio propio de ialimp.
import type {
  Material,
  MaterialAdapter,
  AsignacionMaterial,
  AsignacionMaterialAdapter,
  ResumenStock,
  ResumenContable,
} from '@central/module-materiales'
export { resumenStock, resumenContable, valorStock, disponibilidadTrasReserva } from '@central/module-materiales'
export type { ResumenStock, ResumenContable }

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

export const articuloAdapter: MaterialAdapter<ProductoStockRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: row.empresa_id,
      nombre: row.nombre,
      descripcion: null,
      categoria: row.categoria,
      tipo: 'consumible',
      estado: 'operativo',
      // ialimp no distingue reservadas vs disponibles: todo el stock es disponible.
      cantidadTotal: row.stock_actual,
      cantidadDisponible: row.stock_actual,
      stockMinimo: row.stock_minimo,
      precioCompra: row.precio_unitario ?? 0,
      costeReposicion: row.precio_unitario ?? 0,
      proveedor: row.proveedor_nombre ? { nombre: row.proveedor_nombre } : null,
      activo: row.activo,
      createdAt: row.created_at ?? null,
    }
  },
  fromMaterial(m): ProductoStockRow {
    return {
      id: m.id,
      empresa_id: m.negocioId,
      nombre: m.nombre,
      categoria: m.categoria,
      stock_actual: m.cantidadTotal,
      stock_minimo: m.stockMinimo ?? 0,
      precio_unitario: m.costeReposicion ?? null,
      proveedor_nombre: m.proveedor?.nombre ?? null,
      activo: m.activo,
      created_at: m.createdAt ?? null,
    }
  },
}

export const asignacionAdapter: AsignacionMaterialAdapter<StockConsumoRow> = {
  toAsignacion(row): AsignacionMaterial {
    return {
      id: row.id,
      materialId: row.producto_id,
      // En ialimp el consumo es siempre definitivo (no se devuelven materiales).
      parent: { parentId: row.session_id, parentType: 'sesion_limpieza' },
      cantidadReservada: row.cantidad,
      cantidadDevuelta: null,
      cantidadDanada: null,
      costeDanos: null,
      estado: 'entregado',
      notas: null,
      createdAt: row.created_at ?? null,
    }
  },
  fromAsignacion(a): StockConsumoRow {
    return {
      id: a.id,
      session_id: a.parent?.parentId ?? '',
      producto_id: a.materialId,
      cantidad: a.cantidadReservada,
      precio_unitario: null,
      created_at: a.createdAt ?? null,
    }
  },
}
