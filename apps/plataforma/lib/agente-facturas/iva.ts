// IVA de una factura leída por la IA. Módulo PURO (sin imports) para testearlo con `node --test`.
//
// Antes (pagos.ts) un IVA no leído se inventaba como 21 %: Vercel/OpenRouter (EE. UU., sin IVA
// español) aparecían con un IVA soportado inexistente que alimentaba el IVA trimestral
// (`finanzas.ts` suma `facturas_proveedor.cuota_iva`). Dato que NO hay ≠ dato que no se ha mirado:
// si la IA no da el porcentaje, queda `null` («no se sabe»), nunca 21 ni 0. Un 0 SÍ es dato
// (factura exenta o sin IVA), y se respeta.

export interface IvaFactura {
  /** `null` = la IA no lo leyó. */
  ivaPct: number | null
  /** `null` si no hay porcentaje. */
  cuotaIva: number | null
}

export function calcularIvaFactura(importe: number, ivaLeido: unknown): IvaFactura {
  if (typeof ivaLeido !== 'number' || !Number.isFinite(ivaLeido) || ivaLeido < 0 || ivaLeido > 100) {
    return { ivaPct: null, cuotaIva: null }
  }
  const base = importe / (1 + ivaLeido / 100)
  return { ivaPct: ivaLeido, cuotaIva: Math.round(base * ivaLeido) / 100 }
}
