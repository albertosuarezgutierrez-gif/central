// ────────────────────────────────────────────────────────────────────────────
// Campo competitivo de un municipio para UN aforo concreto. Puro.
//
// «Competencia» no es un número: son cuatro cosas, y solo dos salen de Booking.
//   · densidad de oferta   → Registro de Turismo de Andalucía / INE (fuera de aquí)
//   · profundidad a TU aforo → esto
//   · presión por fecha    → el proxy de ocupación de `curva-mercado.ts`
//   · calidad de los vecinos → esto, y de ahí sale el coste de rampa
//
// El hallazgo que justifica el módulo (Conil, 27/08/2026): a 10 plazas solo hay 3
// comparables frente a 10 a 4 plazas, y aun así el mercado grande paga MENOS por
// plaza (66,50€ contra 83,13€). Mercado fino ≠ mercado caro.
// ────────────────────────────────────────────────────────────────────────────

import { mediana } from './curva-mercado.ts'

export interface ComparableVecino {
  nombre: string
  /** €/noche ya convertido desde el total de la estancia. `null` = sin precio. */
  precioNoche: number | null
  /** Nota de Booking. `null` = el anuncio aún no tiene. */
  nota: number | null
  resenas: number | null
}

export interface CampoCompetitivo {
  aforo: number
  /** Comparables CON precio en la ventana medida. */
  disponibles: number
  adrMediano: number | null
  eurPorPlaza: number | null
  notaMediana: number | null
  resenasMediana: number | null
  /** Cuántos vecinos tenían nota (el resto no se cuenta como 0). */
  conNota: number
  /**
   * Descuento sugerido sobre el ingreso del año 1 por entrar con cero reseñas.
   * `null` = no hay datos de los vecinos, así que hay que declararlo a mano en vez
   * de que el motor se lo invente.
   */
  rampaSugerida: number | null
  razonRampa: string
}

/**
 * El coste de arranque que nadie mete en el Excel: un anuncio nuevo entra con cero
 * reseñas contra vecinos de 9,2 con 296 opiniones. El ranking del canal lo entierra
 * y la visibilidad hay que comprarla con precio, así que el primer año NO se hace
 * el ADR del comparable. Estos tramos son un supuesto declarado, no una medición:
 * por eso viajan como «sugerida» y la pantalla deja cambiarlos.
 */
function rampa(nota: number | null, resenas: number | null): { valor: number | null; razon: string } {
  if (nota == null && resenas == null) {
    return { valor: null, razon: 'sin datos de los vecinos: la rampa hay que declararla a mano' }
  }
  if ((nota ?? 0) >= 9 && (resenas ?? 0) >= 50) {
    return { valor: 0.25, razon: 'vecinos consolidados (nota ≥ 9 y ≥ 50 reseñas): el año 1 entra muy por debajo' }
  }
  if ((nota ?? 0) >= 8 || (resenas ?? 0) >= 20) {
    return { valor: 0.20, razon: 'vecinos asentados: el año 1 necesita descuento para ganar visibilidad' }
  }
  return { valor: 0.15, razon: 'vecinos poco consolidados: la rampa es corta' }
}

export function analizarCompetencia(comparables: ComparableVecino[], aforo: number): CampoCompetitivo {
  const precios = comparables.map(c => c.precioNoche).filter((p): p is number => p != null && p > 0)
  const notas = comparables.map(c => c.nota).filter((n): n is number => n != null)
  const resenas = comparables.map(c => c.resenas).filter((r): r is number => r != null)

  const adrMediano = mediana(precios)
  const notaMediana = mediana(notas)
  const resenasMediana = mediana(resenas)
  const { valor, razon } = rampa(notaMediana, resenasMediana)

  return {
    aforo,
    disponibles: precios.length,
    adrMediano,
    eurPorPlaza: adrMediano != null && aforo > 0 ? adrMediano / aforo : null,
    notaMediana,
    resenasMediana,
    conNota: notas.length,
    rampaSugerida: valor,
    razonRampa: razon,
  }
}
