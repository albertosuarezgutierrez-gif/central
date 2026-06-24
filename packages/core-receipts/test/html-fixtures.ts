import type { ReceiptDoc, Branding } from '../src/index.ts'

export const BRAND_DEFAULT: Branding = {
  nombre: 'ialimp', logoUrl: undefined,
  primario: '#4f46e5', secundario: '#6366f1', light: '#eef2ff', lang: 'es',
}

export const BRAND_SIQUE: Branding = {
  nombre: 'Sique Brilla', logoUrl: undefined,
  primario: '#0a0805', secundario: '#d4a017', light: '#fff8e1', lang: 'es',
}

export const DOC: ReceiptDoc = {
  kind: 'factura-cliente',
  fiscal: {
    numero: 'F-2026-000123', fechaLocal: '16-06-2026 13:45:00',
    emisorNif: 'B00000000', emisorRazon: 'Sique Brilla SL',
    destNif: '12345678Z', destRazon: 'Ana Propietaria',
    base: 100, iva: 21, total: 121,
  },
  lineas: [
    { descripcion: 'Limpieza salida', cantidad: 2, precioUnitario: 35, detalle: 'Piso Centro' },
    { descripcion: 'Lavandería', cantidad: 1, precioUnitario: 30, detalle: 'Piso Centro' },
  ],
  presentacion: {
    estado: 'emitida', fechaEmision: '2026-06-16',
    periodoDesde: '2026-06-01', periodoHasta: '2026-06-30',
    vencimiento: '2026-07-16', concepto: 'Servicios de junio',
    emisorEmail: 'hola@sique.es', emisorTelefono: '600111222',
    emisorIban: 'ES7600000000000000000000', emisorDireccion: 'Calle Falsa 1, Sevilla',
    destDireccion: 'Av. Real 9',
  },
}
