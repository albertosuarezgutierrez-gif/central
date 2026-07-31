// ────────────────────────────────────────────────────────────────────────────
// Lente FLIP: ¿este inmueble sirve para comprar-reformar-vender?
// PURO. Todo determinista: la reforma se estima por baremo (€/m² según la edad
// del edificio, dato del Catastro), nunca por IA. Si falta un dato clave el
// margen es `null` con motivo explícito — no se inventa.
// ────────────────────────────────────────────────────────────────────────────

import type { Oportunidad, SubastaInmueble } from './types.ts'
import { tipoBien } from './extraccion.ts'

/** Baremo de reforma en €/m² según la edad del edificio. Estimación de mercado
 *  para Andalucía (integral / actualización / lavado de cara). */
export const REFORMA_EUR_M2 = { integral: 700, media: 400, ligera: 150 } as const

/** % del precio de venta que se van en comercialización (agencia + notaría del
 *  vendedor + imprevistos de la venta). La plusvalía municipal NO está aquí:
 *  ya la carga `calcularCoste` en la compra y depende de datos que no tenemos
 *  para la venta futura. */
export const PCT_COSTES_VENTA = 0.03

/** Margen mínimo (sobre el capital invertido) para considerar un flip viable. */
export const FLIP_MARGEN_MIN = 0.25

export interface Flip {
  /** € que quedan tras vender a valor de mercado. `null` = no calculable. */
  margen: number | null
  /** Margen sobre el capital invertido (coste puerta abierta + reforma). */
  margenPct: number | null
  reforma: number | null
  costesVenta: number | null
  /** true cuando el tipo de bien y la posesión permiten un flip realista. */
  apto: boolean
  motivos: string[]
  avisos: string[]
}

/**
 * Reforma estimada por baremo. Sin superficie no hay estimación (null).
 * Sin año de construcción se asume reforma media, con aviso — la mayoría del
 * parque en subasta es antiguo y asumir «ligera» infravaloraría el coste.
 */
export function reformaEstimada(
  superficie: number | null | undefined,
  anioConstruccion: number | null | undefined,
  anioActual: number,
): { importe: number | null; nivel: keyof typeof REFORMA_EUR_M2 | null; aviso: string | null } {
  if (superficie == null || superficie <= 0) {
    return { importe: null, nivel: null, aviso: 'Sin superficie: no se puede estimar la reforma.' }
  }
  if (anioConstruccion == null) {
    return {
      importe: Math.round(superficie * REFORMA_EUR_M2.media),
      nivel: 'media',
      aviso: 'Sin año de construcción: se asume reforma media (400€/m²).',
    }
  }
  const edad = anioActual - anioConstruccion
  const nivel = edad > 40 ? 'integral' : edad >= 20 ? 'media' : 'ligera'
  return { importe: Math.round(superficie * REFORMA_EUR_M2[nivel]), nivel, aviso: null }
}

/**
 * Evalúa la lente flip sobre una subasta ya puntuada. El capital invertido es
 * el coste puerta abierta (remate + impuestos + cargas + lanzamiento…) MÁS la
 * reforma; el retorno, el valor de mercado menos los costes de venta.
 */
export function evaluarFlip(s: SubastaInmueble, o: Oportunidad, anioActual: number): Flip {
  const motivos: string[] = []
  const avisos: string[] = []

  const tipo = tipoBien(s.descripcion)
  // Un flip realista es de vivienda (o edificio residencial pequeño): garajes,
  // naves y suelo se venden por otros canales y con otros tiempos.
  const tipoApto = tipo === 'vivienda' || tipo === 'edificio'
  if (!tipoApto) motivos.push(`No es vivienda (${tipo}): fuera de la lente flip.`)

  // En un flip el tiempo es el margen: una ocupación convierte 6 meses en años.
  const posesion = s.situacionPosesoria ?? 'desconocida'
  const posesionBloquea = posesion === 'ocupada' || posesion === 'ocupada_desconocida'
  if (posesionBloquea) motivos.push('Ocupada o con indicios de ocupación: el plazo de venta es imprevisible.')
  else if (posesion === 'desconocida') avisos.push('Posesión desconocida: verificar antes de pujar.')

  if ((s.porcentajeSubastado ?? 100) < 100) motivos.push('Proindiviso: no se puede vender el 100% del inmueble.')

  // Un flip se decide por el precio de venta, así que un €/m² que no describe
  // al inmueble (la mediana de una ciudad entera) no puede declararlo apto: es
  // exactamente así como un piso de 1965 en Sevilla salió con un 86,7% de
  // margen. Se sigue calculando el número, pero no se recomienda.
  if (o.valorOrientativo) {
    motivos.push('El valor de venta sale de la mediana de todo el municipio: no basta para decidir un flip.')
  }

  const apto =
    tipoApto && !posesionBloquea && (s.porcentajeSubastado ?? 100) >= 100 && !o.valorOrientativo

  // El flip vende REFORMADO, así que compara contra el valor sin el descuento
  // por estado — la mejora ya se paga aparte, en `reformaEstimada`.
  const valorVenta = o.valorMercadoReformado ?? o.valorMercado
  if (valorVenta == null || o.coste.total <= 0) {
    motivos.push('Sin valor de mercado o sin coste calculable: margen no estimable.')
    return { margen: null, margenPct: null, reforma: null, costesVenta: null, apto, motivos, avisos }
  }

  const ref = reformaEstimada(s.superficie, s.anioConstruccion, anioActual)
  if (ref.importe == null) {
    motivos.push(ref.aviso ?? 'Reforma no estimable.')
    return { margen: null, margenPct: null, reforma: null, costesVenta: null, apto, motivos, avisos }
  }
  if (ref.aviso) avisos.push(ref.aviso)

  const costesVenta = Math.round(valorVenta * PCT_COSTES_VENTA)
  const invertido = o.coste.total + ref.importe
  const margen = Math.round(valorVenta - invertido - costesVenta)
  const margenPct = invertido > 0 ? Math.round((margen / invertido) * 1000) / 1000 : null

  if (o.origenValor === 'comparables') {
    avisos.push('El valor de venta está ESTIMADO con anuncios de la zona, no con una tasación.')
  }

  return { margen, margenPct, reforma: ref.importe, costesVenta, apto, motivos, avisos }
}
