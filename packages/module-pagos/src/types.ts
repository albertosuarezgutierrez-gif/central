// Tipos canónicos del módulo de pagos a proveedores.
// Sin dependencias de BD ni de proveedor externo — pura definición de dominio.

export type EstadoFactura =
  | 'nueva'
  | 'pendiente_revision'
  | 'aprobada'
  | 'pago_iniciado'
  | 'pagada'
  | 'rechazada'
  | 'aplazada'

export type OrigenFactura = 'gmail' | 'foto' | 'manual'

export interface FacturaProveedor {
  id: string
  cuenta_id: string
  proveedor: string
  concepto: string | null
  importe: number
  fecha_factura: string | null        // YYYY-MM-DD
  fecha_vencimiento: string | null    // YYYY-MM-DD
  numero_factura: string | null
  iban_proveedor: string | null
  estado: EstadoFactura
  telegram_msg_id: number | null
  pago_id: string | null              // Enable Banking payment_id
  pago_url: string | null             // URL de autorización SCA
  pago_confirmado_at: string | null   // ISO timestamp
  aplazar_hasta: string | null        // YYYY-MM-DD
  origen: OrigenFactura
  gmail_uid: number | null
  iva_porcentaje: number
  cuota_iva: number | null
  reserva_id: string | null
  created_at: string
}

export interface PagoParams {
  debtorIban: string
  creditorName: string
  creditorIban: string
  importe: number
  concepto: string
  redirectUrl: string
  endToEndId?: string
}

export interface PagoIniciado {
  payment_id: string
  auth_url: string
}

export type EstadoPago = 'RCVD' | 'PDNG' | 'ACSC' | 'RJCT' | string

export interface DatosFacturaExtraidos {
  proveedor: string | null
  concepto: string | null
  numero_factura: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  importe: number | null
  iva_porcentaje: number | null
  cuota_iva: number | null
  iban_proveedor: string | null
}

// Resultado de la conciliación automática de una factura con movimientos bancarios.
export interface ConciliacionResultado {
  factura_id: string
  movimiento_id: string | null
  conciliada: boolean
}
