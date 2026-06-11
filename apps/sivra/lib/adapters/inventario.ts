// Adapter de inventario para sivra → @iarest/module-inventario
// SIVRA solo tiene un catálogo de productos de referencia (sin stock operativo,
// sin consumos por sesión, sin kits). Solo se mapea Articulo; AsignacionActivo
// no aplica en esta vertical actualmente.
import type { Articulo, ArticuloAdapter } from '@iarest/module-inventario'
export { resumenStock, valorStock } from '@iarest/module-inventario'

export interface ProductoRow {
  id: string
  nombre: string
  referencia: string | null
  categoria: string
  subcategoria: string | null
  unidad: string
  precio_unitario: number | null
  iva_porcentaje: number | null
  proveedor_id: string | null
  notas: string | null
  activo: boolean
}

export const articuloAdapter: ArticuloAdapter<ProductoRow> = {
  toArticulo(row): Articulo {
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.notas ?? null,
      categoria: row.categoria,
      // SIVRA no gestiona stock operativo: las cantidades se modelan como 0
      // (catálogo de referencia, no inventario en tiempo real).
      cantidadTotal: 0,
      cantidadDisponible: 0,
      costeUnitario: row.precio_unitario ?? null,
      proveedorNombre: null,
      imagenUrl: null,
      activo: row.activo,
      createdAt: null,
    }
  },
  fromArticulo(a: Articulo): ProductoRow {
    return {
      id: a.id,
      nombre: a.nombre,
      referencia: null,
      categoria: a.categoria,
      subcategoria: null,
      unidad: 'unidad',
      precio_unitario: a.costeUnitario ?? null,
      iva_porcentaje: 21,
      proveedor_id: null,
      notas: a.descripcion ?? null,
      activo: a.activo,
    }
  },
}
