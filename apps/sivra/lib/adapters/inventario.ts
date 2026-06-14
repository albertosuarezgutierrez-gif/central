// Adapter de inventario para sivra → @central/module-materiales
// SIVRA tiene un catálogo de productos de referencia (sin stock operativo en tiempo real).
// Solo se mapea Material; AsignacionMaterial no aplica actualmente.
import type { Material, MaterialAdapter } from '@central/module-materiales'
export { resumenStock, valorStock } from '@central/module-materiales'

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

export const articuloAdapter: MaterialAdapter<ProductoRow> = {
  toMaterial(row): Material {
    return {
      id: row.id,
      negocioId: '',
      nombre: row.nombre,
      descripcion: row.notas ?? null,
      categoria: row.categoria,
      tipo: 'consumible',
      estado: 'operativo',
      cantidadTotal: 0,
      cantidadDisponible: 0,
      precioCompra: row.precio_unitario ?? 0,
      costeReposicion: row.precio_unitario ?? 0,
      codigo: row.referencia,
      activo: row.activo,
    }
  },
  fromMaterial(m): ProductoRow {
    return {
      id: m.id,
      nombre: m.nombre,
      referencia: m.codigo ?? null,
      categoria: m.categoria,
      subcategoria: null,
      unidad: 'unidad',
      precio_unitario: m.costeReposicion ?? null,
      iva_porcentaje: 21,
      proveedor_id: null,
      notas: m.descripcion ?? null,
      activo: m.activo,
    }
  },
}
