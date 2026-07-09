// apps/plataforma/lib/comercio.ts
// "Comercio" mostrado en el drill-down de gasto personal. En los datos reales, tanto `contraparte`
// como `concepto` suelen traer el nombre precedido del verbo de la operación ("COMPRA EN DIA SEVILLA
// 2260", "PAGO EN ...", "RECIBO ..."). Si se agrupa por el texto CRUDO: (a) las etiquetas quedan feas
// y (b) el MISMO comercio se parte en dos cuando unas filas traen contraparte y otras la traen vacía.
// Aquí se deriva una etiqueta LIMPIA y CONSISTENTE quitando ese prefijo, para que las filas del mismo
// comercio (con o sin contraparte) caigan en el mismo grupo. Módulo puro (sin BD).

export const SIN_IDENTIFICAR = 'Sin identificar'
export const BIZUM = 'Bizum'

// Verbo de la operación al principio del texto ("COMPRA EN ", "PAGO DE ", "RECIBO ", "ADEUDO "…).
// Se quita para quedarnos con el comercio. `\b` evita comerse "COMPRAVENTA" y similares.
const PREFIJO = /^(COMPRA|PAGO|RECIBO|ADEUDO|ABONO|CARGO|BIZUM|TRANSFERENCIA|TRASPASO|LIQUIDACION)\b\s*(EN|A|DE|POR|FAVOR|ONLINE)?\b\s*/i

// Los Bizums (envíos entre personas) llegan como "ENVIO BIZUM CARMEN", "BIZUM A ...", etc. Cada
// destinatario es distinto, así que si se agrupa por nombre se parten en decenas de filas de 1 op.
// Alberto los quiere UNIFICADOS en un solo grupo "Bizum" para ver cuánto se va por esta vía.
const ES_BIZUM = /\bBIZUM\b/i

// Etiqueta de comercio de un movimiento: contraparte si la hay, si no el concepto; en ambos casos se
// quita el prefijo de operación. 'Sin identificar' solo si no queda nada usable.
export function comercioDe(contraparte: string | null, concepto: string | null): string {
  const base = ((contraparte ?? '').trim() || (concepto ?? '').trim())
  if (!base) return SIN_IDENTIFICAR
  if (ES_BIZUM.test(base) || ES_BIZUM.test(concepto ?? '')) return BIZUM
  const limpio = base.replace(PREFIJO, '').trim()
  return limpio || SIN_IDENTIFICAR
}
