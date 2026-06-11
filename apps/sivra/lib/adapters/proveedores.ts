// Adapter de proveedores para sivra → @iarest/module-proveedores
// SIVRA es single-tenant: la tabla `proveedores` no tiene empresa_id.
import type { Proveedor, ProveedorAdapter } from '@iarest/module-proveedores'

export interface ProveedorRow {
  id: string
  nombre: string
  empresa: string | null
  telefono: string | null
  email: string | null
  web: string | null
  whatsapp: string | null
  categoria: string
  notas: string | null
  activo: boolean
}

export const proveedorAdapter: ProveedorAdapter<ProveedorRow> = {
  toProveedor(row): Proveedor {
    return {
      id: row.id,
      nombre: row.nombre,
      tipo: row.categoria,
      contactoNombre: row.empresa ?? null,
      contactoTelefono: row.telefono ?? null,
      contactoEmail: row.email ?? null,
      web: row.web ?? null,
      comisionPct: null,
      ivaTipo: null,
      activo: row.activo,
    }
  },
  fromProveedor(p: Proveedor): ProveedorRow {
    return {
      id: p.id,
      nombre: p.nombre,
      empresa: p.contactoNombre ?? null,
      telefono: p.contactoTelefono ?? null,
      email: p.contactoEmail ?? null,
      web: p.web ?? null,
      whatsapp: null,
      categoria: p.tipo ?? 'general',
      notas: null,
      activo: p.activo,
    }
  },
}
