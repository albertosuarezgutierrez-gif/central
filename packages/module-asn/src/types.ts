// Tipos del módulo ASN (Advance Shipping Notice) — casa de marcas. Agnósticos de BD.
// Un proveedor notifica el envío/recepción de mercancía con líneas. Reutilizable por
// almacén, alquiler de materiales (devoluciones) y transporte.

export type EstadoASN = 'borrador' | 'enviado' | 'recibido' | (string & {})

export interface LineaASN {
  productoNombre: string
  cantidad: number
  unidad?: string | null
  precioUnitario?: number | null
  lote?: string | null
  caducidad?: string | null
}

export interface ASN {
  id?: string
  token?: string | null
  proveedorId?: string | null
  proveedorNombre?: string | null
  fechaRecepcion?: string | null
  lineas: LineaASN[]
  estado: EstadoASN
  notas?: string | null
}

export interface ASNAdapter<TDominio> {
  toASN(fila: TDominio): ASN
  fromASN(a: ASN): TDominio
}
export interface LineaASNAdapter<TDominio> {
  toLinea(fila: TDominio): LineaASN
  fromLinea(l: LineaASN): TDominio
}
