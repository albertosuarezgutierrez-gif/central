// Taxonomía de CATEGORÍA CONTABLE (eje PGC orientativo) + reglas deterministas por palabra
// clave. Módulo PURO (sin BD ni red) → testeable con `node --test`. La persistencia y la IA
// viven en categorizar.ts, que reexporta todo esto para no romper los imports existentes.

// Taxonomía cerrada de categorías (la IA debe elegir una de estas).
export const CATEGORIAS = [
  'nomina', 'proveedor', 'impuestos', 'suministros', 'alquiler',
  'comision_bancaria', 'cobro_cliente', 'transferencia', 'tarjeta',
  'prestamo', 'seguro', 'otros',
] as const
export type Categoria = typeof CATEGORIAS[number]

// Etiqueta visible (con emoji) por categoría. Compartida por /banca y el dashboard.
export const CATEGORIA_LABEL: Record<Categoria, string> = {
  nomina: '👤 Nómina', proveedor: '📦 Proveedor', impuestos: '🏛️ Impuestos',
  suministros: '💡 Suministros', alquiler: '🏠 Alquiler', comision_bancaria: '🏦 Comisión',
  cobro_cliente: '💰 Cobro cliente', transferencia: '🔁 Transferencia', tarjeta: '💳 Tarjeta',
  prestamo: '📉 Préstamo', seguro: '🛡️ Seguro', otros: '• Otros',
}

// Mapa categoría → cuenta PGC orientativa (Plan General Contable español).
const PGC: Record<Categoria, string> = {
  nomina: '640', proveedor: '600', impuestos: '475', suministros: '628',
  alquiler: '621', comision_bancaria: '626', cobro_cliente: '700',
  transferencia: '572', tarjeta: '572', prestamo: '170', seguro: '625', otros: '629',
}

export function pgcDe(cat: string): string {
  return (CATEGORIAS as readonly string[]).includes(cat) ? PGC[cat as Categoria] : PGC.otros
}

// Reglas deterministas: categoriza por palabras clave del concepto/contraparte SIN IA.
// Cubre la mayoría de movimientos al instante (y sin gastar el cupo gratuito de NIM). Lo
// que no encaje devuelve null → va a la IA. Orden: de lo más específico a lo más genérico.
export function categorizarPorReglas(concepto: string | null, contraparte: string | null, importe: number): Categoria | null {
  const t = `${concepto ?? ''} ${contraparte ?? ''}`.toUpperCase()
  const has = (...ks: string[]) => ks.some(k => t.includes(k))

  // Liquidación/pago del recibo de la tarjeta (movimiento espejo cuenta↔tarjeta), ANTES que la
  // compra: su concepto también menciona "tarjeta" pero no es un gasto real.
  if (has('PAGO RECIBO 466', 'TARJ.CRDTO', 'TARJ CRDTO', '466203201', 'PAGO DE TARJETA', 'LIQUIDACION DE TARJETA', 'LIQUIDACION TARJETA')) return 'transferencia'
  // COMPRA con tarjeta en comercio: va ANTES que las reglas de comercio porque el NOMBRE del
  // comercio puede contener cualquier palabra-trampa (restaurante "LA HACIENDA GOLF" → caía a
  // impuestos por el 'HACIENDA'; un bar "LA MUTUA" caería a seguro). La categoría contable de
  // una compra de tarjeta es 'tarjeta' sea cual sea el comercio; el análisis de consumo vive en
  // `subcategoria` (keywords propias) y el negocio/deducibilidad en `destino`.
  if (has('PAGO CON TARJETA', 'COMPRA EN ', 'COMPRA TARJ')) return 'tarjeta'
  if (has('SEGURO', 'GENERALI', 'MAPFRE', ' AXA', 'ALLIANZ', 'MUTUA', 'ZURICH', 'REALE', 'CASER', 'LINEA DIRECTA', 'PELAYO')) return 'seguro'
  if (has('NOMINA', 'NÓMINA', 'PAGA EXTRA', 'SALARIO', 'PAGO DE NOMINA')) return 'nomina'
  // OJO: NO usar 'HACIENDA' a secas — casa con comercios llamados "Hacienda …" (misma lección
  // que el diccionario de subcategorías, 07/07/2026). Solo frases inequívocas del fisco.
  if (has('AEAT', 'AGENCIA TRIBUTARIA', 'HACIENDA PUBLICA', 'HACIENDA PÚBLICA', 'IMPUESTO DE HACIENDA', 'TRIBUT HACIENDA', 'IMPUEST', 'IRPF', 'TRIBUTARI', 'RECAUDACION', 'RECAUDACIÓN', 'AYUNTAMIEN', ' IBI ', 'CONTRIBUCION', 'PLUSVALIA', 'TGSS', 'SEGURIDAD SOCIAL', 'TESOR. GRAL', 'TESORERIA GENERAL', 'MODELO 3', 'TASA ')) return 'impuestos'
  if (has('PRESTAMO', 'PRÉSTAMO', 'AMORTIZAC', 'CUOTA PREST', 'HIPOTECA', 'FINANCIAC', 'LEASING')) return 'prestamo'
  if (has('COMISION', 'COMISIÓN', 'COMIS.', 'MANTENIMIENTO CUENTA', 'CUOTA TARJETA', 'GASTOS ADMIN')) return 'comision_bancaria'
  if (has('ALQUILER', 'ARRENDAMIENT', 'RENTA MENSUAL')) return 'alquiler'
  if (has('ENDESA', 'IBERDROLA', 'NATURGY', 'REPSOL', 'MOVISTAR', 'VODAFONE', 'ORANGE', 'FINETWORK', 'TELEFONICA', 'JAZZTEL', 'MASMOVIL', 'EMASESA', 'CANAL ISABEL', 'GAS NATURAL', 'SUMINISTRO', 'ELECTRIC', 'FACTURA DE AGUA', 'FACTURA LUZ', 'FACTURA GAS')) return 'suministros'
  if (has('BIZUM')) return importe >= 0 ? 'cobro_cliente' : 'transferencia'
  // OJO: incluir 'TRANSF.' (con punto) además de 'TRANSF ' (con espacio): los conceptos de Kutxabank
  // llegan como `TRANSF. 0128 F0552026` (punto, no espacio) y sin esto se colaban a la IA, que las
  // rebautizaba con etiquetas inventadas ("Comisión bancaria" para una transferencia de 1.691,58€).
  if (has('TRANSFERENCIA', 'TRASPASO', 'ABONO POR TRANSF', 'TRANSF ', 'TRANSF.')) return importe >= 0 ? 'cobro_cliente' : 'transferencia'
  if (has('TARJETA', 'TARJ.', 'PAGO EN ', 'PAGO TARJETA', 'COMERCIO')) return 'tarjeta'
  if (has('RECIBO', 'ADEUDO', 'SEPA', 'DOMICILIAC', 'CUOTA ')) return 'proveedor'
  return null
}
