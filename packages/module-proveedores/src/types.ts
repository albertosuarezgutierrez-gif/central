// Tipos del módulo Proveedores (casa de marcas). Agnósticos de vertical y de BD.
// Un `ProveedorServicio` es un servicio subcontratado a un proveedor para un Encargo
// (evento/porte/alquiler/cita) — la costura parent/parentType — con su comisión.

export type ParentType =
  | 'evento'
  | 'porte'
  | 'alquiler'
  | 'cita_clinica'
  | (string & {})

export interface ParentRef {
  parentId: string
  parentType: ParentType
}

export type EstadoProveedorServicio =
  | 'pendiente'
  | 'confirmado'
  | 'pagado'
  | 'cobrada' // comisión cobrada
  | (string & {})

export interface Proveedor {
  id: string
  nombre: string
  tipo?: string | null
  contactoNombre?: string | null
  contactoTelefono?: string | null
  contactoEmail?: string | null
  web?: string | null
  comisionPct?: number | null
  ivaTipo?: number | null
  activo: boolean
}

export interface ProveedorServicio {
  id: string
  parent: ParentRef
  proveedorId: string
  descripcion?: string | null
  importe: number
  comisionPct: number
  comisionImporte: number
  ivaTipo?: number | null
  estado: EstadoProveedorServicio
  confirmadoAt?: string | null
  cobradaAt?: string | null
}

// PORTs de adaptación: cada vertical mapea su fila de dominio <-> tipo genérico.
export interface ProveedorAdapter<TDominio> {
  toProveedor(fila: TDominio): Proveedor
  fromProveedor(p: Proveedor): TDominio
}
export interface ProveedorServicioAdapter<TDominio> {
  toServicio(fila: TDominio): ProveedorServicio
  fromServicio(s: ProveedorServicio): TDominio
}
