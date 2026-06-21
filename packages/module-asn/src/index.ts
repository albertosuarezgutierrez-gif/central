// @central/module-asn — ASN genérico de la casa de marcas.
// Recepción de mercancía con líneas + totales. Cada vertical aporta su adaptador.
// Ver docs/DISENO-modularizacion-verticales.md.

export type { EstadoASN, LineaASN, ASN, ASNAdapter, LineaASNAdapter } from './types'

export { round2, totalLinea, totalLineas, unidadesTotales } from './logic'
