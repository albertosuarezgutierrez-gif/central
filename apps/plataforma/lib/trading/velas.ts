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

// Clave de periodo de una fecha suelta: 'YYYY-MM' (mes) o 'YYYY-MM-DD' del lunes ISO (semana).
// Misma definición que usa `barrasPeriodicas` para agrupar — se extrae para poder preguntar «¿la
// última barra pertenece al periodo que AÚN está corriendo?» sin duplicar la regla de la semana.
export function claveDePeriodo(fecha: string, periodo: 'sem' | 'mes'): string {
  if (periodo === 'mes') return fecha.slice(0, 7)
  const d = new Date(`${fecha}T00:00:00Z`)
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
  return lunes.toISOString().slice(0, 10)
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

// Barras hasta `hasta` DESCARTANDO la del periodo que aún está corriendo. Úsala SIEMPRE para medir
// señales de vela: `barrasPeriodicas` corta la serie en la fecha del snapshot, así que su última
// barra es el mes/semana EN CURSO, con solo los días transcurridos dentro.
//
// 🚨 LANDMINE (06/08/2026) — por qué existe esta función. El precio de una barra a medias es el
// precio real (el último cierre), pero el VOLUMEN es ACUMULATIVO: el día 1 del mes lleva 1 sesión de
// las ~21 que tendrá. Medir ese volumen contra la media de 12 meses COMPLETOS da ~1/21 = 0,05, y la
// capitulación (que exige ≥1,5×) se vuelve indetectable. Se vio en producción: los snapshots cuyo
// día 1 caía en día hábil daban volRelMes mediana 0,047-0,07, y los que caían en sábado/domingo
// —sin cotización, así que la última barra ERA el mes anterior cerrado— daban 1,02-1,04. La misma
// serie, el mismo código, dos resultados según el calendario: la firma de una barra truncada.
// Lo grave no era el número sino lo que se guardaba: `capitulacionMes:false` = «lo he mirado y no
// salta», cuando la verdad era «esta barra está a medias, no se puede saber». Un `false` que miente.
// Además reproduce el estudio original, que midió sobre velas mensuales COMPLETAS.
export function barrasCerradas(puntos: PuntoVol[], hasta: string, periodo: 'sem' | 'mes'): Barra[] {
  const barras = barrasPeriodicas(puntos, hasta, periodo)
  const ultima = barras[barras.length - 1]
  if (ultima && ultima.clave === claveDePeriodo(hasta, periodo)) barras.pop()
  return barras
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

// 🚨 LANDMINE (08/08/2026) — la serie de precios NO viene ajustada por acciones corporativas.
// Un contrasplit 1:20 multiplica el precio por 20 de un día para otro sin que nadie gane un duro, y
// un split normal lo divide; si la fuente no corrige el histórico, la ventana lee «−95% con volumen»
// y `senalCapitulacion` escribía `true`: una capitulación que nunca ocurrió, con la misma pinta que
// las 18.000 buenas. Visto en el retrovisor: QUHUO 110,43$ → 9,63$ en un mes y 0,13$ → 2,90$ en dos;
// Lytus 1.545 → 427 → 47. También lo dispara el REUSO de ticker (la serie de dos empresas pegada).
// El otro sabor es de VOLUMEN: Smurfit Westrock empezó a cotizar en jul-2024 y sus 12 barras previas
// —cotización residual— dieron un volumen relativo de 4.992×.
// Umbrales de lo IMPOSIBLE, no de lo raro (mismo criterio que `calidad-datos.ts`): un valor sano no
// triplica ni divide entre tres su cierre MENSUAL, ni negocia 50 veces su volumen medio de un año.
// LÍMITE ASUMIDO: las barras siguientes a la costura siguen contaminadas con ratios ya plausibles
// (SW dio 4,8 → 3,7 → 2,4 los tres meses siguientes) y esas NO se cazan. Se prefiere dejar pasar
// una dudosa a anular señales reales.
export const SALTO_PRECIO_MAX = 3    // cierre de una barra vs la anterior: ×3 o ÷3 = costura
export const VOL_REL_MAX = 50        // volumen de la barra vs la media de la ventana

// ¿Hay una costura (acción corporativa sin ajustar / reuso de ticker) en las últimas `ventana`+1
// barras — las MISMAS que miran `caidaDesdeMaximo` y `volumenRelativo`? Puro, sin efectos.
export function serieDiscontinua(barras: Barra[], ventana = 12): boolean {
  if (barras.length < ventana + 1) return false
  for (let i = barras.length - ventana; i < barras.length; i++) {
    const previo = barras[i - 1].cierre, actual = barras[i].cierre
    if (!(previo > 0) || !(actual > 0)) continue
    const ratio = actual / previo
    if (ratio >= SALTO_PRECIO_MAX || ratio <= 1 / SALTO_PRECIO_MAX) return true
  }
  return false
}

export type SenalCapitulacion = {
  // TRES estados, nunca dos: null = «no se puede saber con estos datos» (serie corta, sin volumen o
  // rota por una acción corporativa), false = «se ha mirado y no salta», true = «salta». Colapsar
  // null a false pintaría de «no hay señal» a un valor que simplemente no tiene histórico cargado
  // todavía; colapsarlo a true pintaría de capitulación a un contrasplit.
  activa: boolean | null
  caida: number | null
  volRel: number | null
  motivo: 'sin-datos' | 'serie-rota' | 'sin-caida' | 'sin-volumen' | 'activa'
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
  // Costura en la ventana ⇒ ni la caída ni el volumen relativo significan nada: los DOS se anulan.
  // Devolverlos «por diagnóstico» los dejaría contaminando cualquier análisis que los agregue (una
  // caída del −99% por un split entra igual en un recuento de «caídas ≥25%»). El precio crudo sigue
  // guardado aparte, así que no se pierde la trazabilidad.
  if (volRel > VOL_REL_MAX || serieDiscontinua(barras, ventana)) {
    return { activa: null, caida: null, volRel: null, motivo: 'serie-rota' }
  }
  if (caida > -caidaMin) return { activa: false, caida, volRel, motivo: 'sin-caida' }
  if (volRel < volMin) return { activa: false, caida, volRel, motivo: 'sin-volumen' }
  return { activa: true, caida, volRel, motivo: 'activa' }
}
