// Clasificadores puros para el agente de facturas.

// Detecta documentos que NO son facturas (presupuestos/cotizaciones) para no
// contabilizarlos. Evita la duplicidad presupuesto+factura del mismo gasto.
export function esPresupuesto(texto: string, nombre = ''): boolean {
  const t = `${nombre} ${texto}`.toLowerCase()
  const esQuote = /\b(presupuesto|cotizaci[oó]n|budget|quote)\b/.test(t) || /(^|[^a-z])est-\d/.test(nombre.toLowerCase())
  const esFactura = /\bfactura\b|\binvoice\b|adeudo|recibo/.test(t)
  return esQuote && !esFactura
}

// La IA ya leyó el documento COMPLETO: si dice que es presupuesto/cotización/proforma, o el concepto
// empieza así, NO es factura aunque el texto contenga «recibo» o «factura» (incidente 03/11/2026:
// «Presupuesto póliza Asisa Vida…» entró como gasto de 59,26 € porque la póliza menciona «recibo»).
export function esPresupuestoExtraido(d: { tipo_documento?: unknown; concepto?: string | null }): boolean {
  const tipo = typeof d.tipo_documento === 'string'
    ? d.tipo_documento.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
    : ''
  if (/^(presupuesto|cotizacion|proforma|quote|budget)$/.test(tipo)) return true
  return /^\s*(presupuesto|cotizaci[oó]n|proforma)\b/i.test(d.concepto ?? '')
}
