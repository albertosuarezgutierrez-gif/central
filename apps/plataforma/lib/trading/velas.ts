import type { PuntoVol } from './precios-stooq'

// Señales de VELA + VOLUMEN sobre barras mensuales/semanales (idea de Alberto, 04/08/2026).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red.
//
// QUÉ SE MIDE Y POR QUÉ (estudio previo sobre 1.300 velas mensuales de 7 large caps US 2008-2026,
// punto-en-el-tiempo, exceso sobre la propia deriva de cada valor). Resumen honesto:
//   · Las FIGURAS de vela solas NO valen: martillo −3,0% de exceso a 6 meses (n=105), envolvente
//     alcista −0,3% (n=75), vela verde de cuerpo grande −0,6% (n=279). Por eso este módulo NO
//     implementa detectores de figuras: sería código muerto que invita a usarlo.
//   · El REBOTE en la media larga (tocar la EMA100 mensual y cerrar encima) fue lo PEOR de todo lo
//     medido: −11,9% de exceso a 6 meses y −23,3% a 12 (n=51), con solo 8 de 40 casos en positivo a
//     un año. NO es un soporte: es la señal de que el valor acaba de devolver años de tendencia.
//     Se deja SIN implementar a propósito (ver H8 del pre-registro).
//   · Lo único con señal fue la CAÍDA + el VOLUMEN: cotizar ≥25% por debajo del máximo de las 12
//     barras anteriores dio +6,6% de exceso a 6 meses (n=165), y sumándole volumen ≥1,5× la media
//     +6,9% a 6 meses y +18,5% a 12 (n=34, 74% en positivo). El volumen alto ARRIBA (sobre la media
//     larga) daba −8,8%: no confirma rupturas, marca capitulaciones.
//   · Precio del billete: la tasa de batacazos >15% sube al 50% (base 35%). Se gana más y se sufre
//     más — no es gratis.
// La muestra es corta y de un solo régimen: esto se RECOLECTA en el retrovisor sobre el universo
// entero antes de que toque nada del ranking (H8). Aquí no se decide, se mide.
//
// ⚠️ La fuente diaria (`PuntoVol`) trae cierre y volumen, NO el máximo/mínimo INTRADÍA. Los extremos
// de una barra son por tanto de CIERRES diarios, y por eso se llaman `maxCierre`/`minCierre` y no
// `high`/`low`: llamarlos OHLC invitaría a construir figuras de vela sobre datos que no lo son.

export type Barra = {
  clave: string          // 'YYYY-MM' (mes) o 'YYYY-MM-DD' del lunes (semana)
  apertura: number       // primer cierre diario del periodo
  cierre: number         // último cierre diario del periodo
  maxCierre: number
  minCierre: number
  volumen: number | null // suma del periodo; null si NINGÚN día trajo volumen
}

// Remuestrea la serie diaria a barras de periodo, hasta `hasta` inclusive. Hermana con volumen de
// `cierresPeriodicos` de backtest-puro.ts (misma definición de semana: lunes ISO).
export function barrasPeriodicas(puntos: PuntoVol[], hasta: string, periodo: 'sem' | 'mes'): Barra[] {
  const out: Barra[] = []
  for (const p of puntos) {
    if (p.fecha > hasta) break
    let clave: string
    if (periodo === 'mes') clave = p.fecha.slice(0, 7)
    else {
      const d = new Date(`${p.fecha}T00:00:00Z`)
      const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
      clave = lunes.toISOString().slice(0, 10)
    }
    const ult = out[out.length - 1]
    if (ult && ult.clave === clave) {
      ult.cierre = p.cierre
      ult.maxCierre = Math.max(ult.maxCierre, p.cierre)
      ult.minCierre = Math.min(ult.minCierre, p.cierre)
      // Un día sin volumen NO se cuenta como 0: sumarlo mentiría a la baja. Solo suma lo conocido,
      // y la barra queda a null únicamente si NINGÚN día del periodo trajo volumen.
      if (p.volumen != null) ult.volumen = (ult.volumen ?? 0) + p.volumen
    } else {
      out.push({ clave, apertura: p.cierre, cierre: p.cierre, maxCierre: p.cierre, minCierre: p.cierre, volumen: p.volumen })
    }
  }
  return out
}

// Caída del cierre de la ÚLTIMA barra respecto al máximo de las `ventana` barras ANTERIORES (la
// actual excluida: incluirla haría que un valor en máximos nunca pudiera dar 0). Negativo = por
// debajo del máximo. null si no hay `ventana` barras previas — «no se sabe», nunca 0.
export function caidaDesdeMaximo(barras: Barra[], ventana = 12): number | null {
  if (barras.length < ventana + 1) return null
  const actual = barras[barras.length - 1].cierre
  if (!(actual > 0)) return null
  let max = -Infinity
  for (let i = barras.length - 1 - ventana; i < barras.length - 1; i++) max = Math.max(max, barras[i].cierre)
  if (!(max > 0)) return null
  return actual / max - 1
}

// Volumen de la última barra contra la media de las `ventana` anteriores. null si falta el volumen
// de la barra actual o no hay suficientes barras previas CON volumen (fuente incompleta ≠ volumen 0).
export function volumenRelativo(barras: Barra[], ventana = 12): number | null {
  if (barras.length < ventana + 1) return null
  const actual = barras[barras.length - 1].volumen
  if (actual == null || !(actual > 0)) return null
  let suma = 0, n = 0
  for (let i = barras.length - 1 - ventana; i < barras.length - 1; i++) {
    const v = barras[i].volumen
    if (v != null && v > 0) { suma += v; n++ }
  }
  // Con menos de la mitad de la ventana la media no es representativa: mejor «no se sabe».
  if (n < Math.ceil(ventana / 2)) return null
  return actual / (suma / n)
}

export const CAIDA_MIN = 0.25   // ≥25% por debajo del máximo de 12 barras
export const VOL_MIN = 1.5      // ≥1,5× el volumen medio de 12 barras

export type SenalCapitulacion = {
  // TRES estados, nunca dos: null = «no se puede saber con estos datos» (serie corta o sin volumen),
  // false = «se ha mirado y no salta», true = «salta». Colapsar null a false pintaría de «no hay
  // señal» a un valor que simplemente no tiene histórico cargado todavía.
  activa: boolean | null
  caida: number | null
  volRel: number | null
  motivo: 'sin-datos' | 'sin-caida' | 'sin-volumen' | 'activa'
}

// Señal medida como la única con exceso positivo en el estudio: caída fuerte CON volumen.
// NO decide nada: se recolecta en el retrovisor (H8) antes de tocar ranking o cestas.
export function senalCapitulacion(
  barras: Barra[],
  { ventana = 12, caidaMin = CAIDA_MIN, volMin = VOL_MIN }: { ventana?: number; caidaMin?: number; volMin?: number } = {},
): SenalCapitulacion {
  const caida = caidaDesdeMaximo(barras, ventana)
  const volRel = volumenRelativo(barras, ventana)
  if (caida == null || volRel == null) return { activa: null, caida, volRel, motivo: 'sin-datos' }
  if (caida > -caidaMin) return { activa: false, caida, volRel, motivo: 'sin-caida' }
  if (volRel < volMin) return { activa: false, caida, volRel, motivo: 'sin-volumen' }
  return { activa: true, caida, volRel, motivo: 'activa' }
}
