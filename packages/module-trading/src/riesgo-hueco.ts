// 🕳️ Riesgo de HUECO y viabilidad del stop.
//
// Nació de dos hechos medidos el 19/08/2026 sobre la cuenta real:
//   · De las 116 ventas de 2026, 109 fueron órdenes STOP y sumaron −21.692,60 USD; las 7 ventas a
//     mercado sumaron +2.946,74 USD. La mediana de distancia a la que saltó el stop fue del 1,30%
//     sobre la entrada, y 25 de 95 saltaron a menos del 1%. CoreWeave SUBIÓ un 42,1% entre la
//     primera y la última operación mientras dejaba 6.369 USD de pérdida en 33 movimientos.
//   · Ese mismo día Moderna abrió a +84,3% sobre el cierre anterior. Un hueco así atraviesa
//     cualquier stop: no hay precio entre el cierre y la apertura donde ejecutar.
//
// De ahí las dos preguntas que responde este módulo, ambas con datos que ya tenemos (velas):
//   1. ¿Está el stop DENTRO del ruido normal del valor? (→ salta por respirar, no por fallar)
//   2. ¿Cuántas veces un hueco lo habría ATRAVESADO? (→ el stop no protege, solo fija el peor precio)
//
// Todo puro y con tres estados: cuando no hay historia suficiente se devuelve `null`, nunca un
// número tranquilizador. Un «no lo sé» servido como 0 es lo que convierte un stop temerario en
// uno que parece prudente.
import type { Vela } from './types.ts'
import { atr } from './indicadores.ts'

/** Salto entre el cierre de una sesión y la apertura de la siguiente, en % sobre el cierre. */
export type Hueco = { fecha: string; pct: number }

/** Huecos de apertura de la serie. El signo es el del salto: negativo = abrió por debajo. */
export function huecos(velas: Vela[]): Hueco[] {
  const out: Hueco[] = []
  for (let i = 1; i < velas.length; i++) {
    const prev = velas[i - 1].cierre
    if (!(prev > 0)) continue
    out.push({ fecha: velas[i].fecha, pct: ((velas[i].apertura - prev) / prev) * 100 })
  }
  return out
}

/** Recorrido intradía desde la apertura hasta el mínimo, en % (siempre ≤ 0). Es lo que se come un
 *  stop en una sesión NORMAL, sin necesidad de que la tesis falle. */
export function caidaIntradia(v: Vela): number | null {
  if (!(v.apertura > 0)) return null
  return ((v.bajo - v.apertura) / v.apertura) * 100
}

function percentil(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[i]
}

export type PerfilHueco = {
  /** Sesiones con hueco medidas. */
  n: number
  /** Mediana del hueco a la baja, en % (valor positivo = magnitud). */
  tipico: number
  /** Percentil 95 del hueco a la baja, en %. */
  p95: number
  /** El peor hueco a la baja de la serie, en %. */
  peor: number
  /** Fracción [0,1] de sesiones cuyo hueco a la baja superó `distanciaPct`, es decir, en las que
   *  el stop se ejecutó PEOR que su precio (o directamente no protegió). */
  fraccionSaltada: (distanciaPct: number) => number
}

/** Perfil de huecos a la baja. `null` si no hay al menos `minSesiones` (no se estima el riesgo de
 *  hueco de un valor recién listado: no hay con qué). */
export function perfilHuecos(velas: Vela[], minSesiones = 60): PerfilHueco | null {
  const bajistas = huecos(velas).filter(h => h.pct < 0).map(h => Math.abs(h.pct))
  const total = Math.max(0, velas.length - 1)
  if (total < minSesiones) return null
  return {
    n: total,
    tipico: percentil(bajistas, 50) ?? 0,
    p95: percentil(bajistas, 95) ?? 0,
    peor: bajistas.length ? Math.max(...bajistas) : 0,
    fraccionSaltada: (d: number) => (d <= 0 ? 1 : bajistas.filter(x => x > d).length / total),
  }
}

export type Veredicto = 'decorativo' | 'ajustado' | 'razonable'

export type EvaluacionStop = {
  /** % de sesiones NORMALES en las que el recorrido desde la apertura habría tocado el stop. */
  saltaPorRuido: number
  /** % de sesiones en las que un hueco a la baja lo atravesó (el stop no protegió). */
  saltaPorHueco: number
  /** Distancia sugerida, en %, medida en múltiplos de ATR sobre el último cierre. */
  sugerida: number | null
  veredicto: Veredicto
  /** Frase para el aviso; el consumidor la pinta tal cual. */
  motivo: string
}

/**
 * Evalúa una distancia de stop contra el comportamiento REAL del valor.
 *
 * `null` si no hay historia suficiente: sin ella no se puede decir que un stop sea prudente, y
 * decirlo igualmente sería justo el error que este módulo existe para evitar.
 *
 * Umbrales (deliberadamente conservadores, se pueden calibrar con datos forward):
 *   · `decorativo` — el stop salta por ruido en ≥1 de cada 3 sesiones, o la distancia es menor que
 *     el hueco típico del valor. No mide riesgo: mide impaciencia.
 *   · `ajustado`   — salta por ruido en ≥1 de cada 6 sesiones.
 *   · `razonable`  — por debajo de eso.
 */
export function evaluarStop(
  velas: Vela[],
  distanciaPct: number,
  opciones: { multiploAtr?: number; minSesiones?: number } = {},
): EvaluacionStop | null {
  const { multiploAtr = 2, minSesiones = 60 } = opciones
  const perfil = perfilHuecos(velas, minSesiones)
  if (!perfil || distanciaPct <= 0) return null

  const caidas = velas.map(caidaIntradia).filter((x): x is number => x !== null)
  if (!caidas.length) return null
  const saltaPorRuido = (caidas.filter(c => Math.abs(c) > distanciaPct).length / caidas.length) * 100
  const saltaPorHueco = perfil.fraccionSaltada(distanciaPct) * 100

  const ultimo = velas[velas.length - 1].cierre
  const a = atr(velas)
  const sugerida = a !== null && ultimo > 0 ? (a * multiploAtr / ultimo) * 100 : null

  let veredicto: Veredicto = 'razonable'
  let motivo = `Salta por ruido normal en el ${saltaPorRuido.toFixed(0)}% de las sesiones.`
  if (saltaPorRuido >= 33 || distanciaPct < perfil.tipico) {
    veredicto = 'decorativo'
    motivo =
      distanciaPct < perfil.tipico
        ? `La distancia (${distanciaPct.toFixed(2)}%) es menor que el hueco de apertura TÍPICO del valor ` +
          `(${perfil.tipico.toFixed(2)}%): muchas mañanas ya abre por debajo del stop.`
        : `Salta por el ruido normal del valor en el ${saltaPorRuido.toFixed(0)}% de las sesiones: ` +
          `mide impaciencia, no riesgo.`
  } else if (saltaPorRuido >= 17) {
    veredicto = 'ajustado'
    motivo = `Salta por ruido en el ${saltaPorRuido.toFixed(0)}% de las sesiones (1 de cada ${Math.round(100 / saltaPorRuido)}).`
  }
  if (saltaPorHueco >= 1) {
    motivo +=
      ` Además, en el ${saltaPorHueco.toFixed(1)}% de las sesiones un hueco de apertura lo atravesó: ` +
      `ahí el stop no protege, solo fija el peor precio (el peor hueco de la serie fue ${perfil.peor.toFixed(1)}%).`
  }
  return { saltaPorRuido, saltaPorHueco, sugerida, veredicto, motivo }
}

/**
 * Títulos que se pueden comprar sin arriesgar más de `riesgoMaxEur` si el stop se ejecuta a su
 * distancia — la respuesta correcta a «este stop es demasiado corto» NO es acercarlo aún más ni
 * alejarlo a ojo, es COMPRAR MENOS. `null` si falta cualquier pata (nunca un tamaño inventado).
 */
export function tamanoPorRiesgo(
  precio: number,
  distanciaPct: number,
  riesgoMaxEur: number,
): number | null {
  if (!(precio > 0) || !(distanciaPct > 0) || !(riesgoMaxEur > 0)) return null
  const perdidaPorTitulo = precio * (distanciaPct / 100)
  if (!(perdidaPorTitulo > 0)) return null
  return Math.floor(riesgoMaxEur / perdidaPorTitulo)
}
