// Idiomas soportados por la capa de presentación (es por defecto).
export type Lang = 'es' | 'en' | 'ca'

// Tipos de documento de cara al cliente.
export type ReceiptKind = 'ticket-verifactu' | 'factura-cliente' | 'recibo-limpieza'

// Campos fiscales: los renderers los copian VERBATIM, nunca los recalculan ni mutan.
// `huella` y `qrData` solo están presentes en tickets VeriFactu.
export interface FiscalFields {
  numero: string         // número/serie del documento
  fechaLocal: string     // dd-mm-yyyy hh:mm:ss (hora local AEAT)
  emisorNif: string
  emisorRazon: string
  destNif?: string
  destRazon?: string
  base: number           // base imponible
  iva: number            // cuota de IVA
  total: number
  huella?: string        // VeriFactu: hash encadenado
  qrData?: string        // VeriFactu: URL TIKE-CONT del QR
}

export interface ReceiptLine {
  descripcion: string
  cantidad: number
  precioUnitario: number
}

// Identidad visual de un negocio. Las plantillas la inyectan vía CSS custom props.
export interface Branding {
  nombre: string
  logoUrl?: string
  primario: string       // hex
  secundario: string     // hex
  light: string          // hex
  lang: Lang
}

// Documento listo para renderizar. `fiscal` es de solo lectura.
export interface ReceiptDoc {
  kind: ReceiptKind
  fiscal: Readonly<FiscalFields>
  lineas: ReadonlyArray<ReceiptLine>
  glosa?: string         // texto NO-fiscal ya resuelto (IA o fallback). Opcional.
}

// Contexto que recibe el proveedor de glosa. Solo datos NO-fiscales.
export interface GlosaContext {
  kind: ReceiptKind
  clienteNombre?: string
  resumenItems: string
  lang: Lang
  negocioTono?: string
}

// Proveedor de glosa (la implementación con IA llega en la Fase 3).
export interface GlosaProvider {
  generar(ctx: GlosaContext): Promise<string>
}
