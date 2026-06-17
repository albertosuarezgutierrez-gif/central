// Clasificadores puros para el agente de facturas.

// Detecta documentos que NO son facturas (presupuestos/cotizaciones) para no
// contabilizarlos. Evita la duplicidad presupuesto+factura del mismo gasto.
export function esPresupuesto(texto: string, nombre = ''): boolean {
  const t = `${nombre} ${texto}`.toLowerCase()
  const esQuote = /\b(presupuesto|cotizaci[oó]n|budget|quote)\b/.test(t) || /(^|[^a-z])est-\d/.test(nombre.toLowerCase())
  const esFactura = /\bfactura\b|\binvoice\b|adeudo|recibo/.test(t)
  return esQuote && !esFactura
}
