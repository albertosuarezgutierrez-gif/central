import type { PuntoPrecio } from './precios-stooq'

// ¿Qué hace la acción DESPUÉS de que la vendamos? (hipótesis H12 del pre-registro, 28/08/2026).
// Módulo PURO y testeado — sin `@/`, sin Prisma, sin red.
//
// Por qué existe: TODO lo que mide el retrovisor se corta en el día 91 — `ret28/56/91` y las siete
// reglas de `salidas.ts`, que cuando no disparan se rellenan con el retorno del horizonte. O sea que
// la pregunta de Alberto («¿y si hubiera aguantado más?») hoy NO tiene dato: no es que se midiera y
// aguantar saliera peor, es que la cinta se acaba ahí. Los 91 días son el TECHO de la medición, no un
// ganador contra horizontes que nunca se probaron. Esto extiende la cinta y recoge, además del
// retorno a 182 y 364 días, el TECHO alcanzable y el estado de la tendencia el día que se vende.
//
// Cómo se lee el arrepentimiento: todas las reglas de `salidas.ts` miden desde la MISMA entrada, así
// que `ret364 − salidaX` es, literalmente, lo que costó vender por esa regla en vez de aguantar.
// No hace falta guardar nada más para calcularlo.
//
// ⚠️ Igual que en `salidas.ts`, solo hay cierres diarios: el máximo es el mayor CIERRE, no el máximo
// intradía (el techo real fue algo más alto, así que esta medida es la conservadora).

export type Continuacion = {
  // Retorno desde la entrada a horizontes LARGOS, al lado del ret91 que ya se guarda.
  // null = la ventana todavía no ha llegado a ese día (los snapshots recientes), nunca un 0 de relleno.
  ret182: number | null
  ret364: number | null
  // Techo y suelo desde la entrada dentro de la ventana larga, y cuándo se tocó el techo. Sirven para
  // saber si la salida llegó tarde (el techo quedó atrás) o pronto (el techo estaba por venir).
  // 🚨 NULL mientras la ventana NO esté completa: un máximo sobre media ventana es una COTA INFERIOR,
  // y publicarlo como «el techo» sería afirmar un dato que aún no se ha visto entero.
  mfe364: number | null
  mae364: number | null
  diasMfe364: number | null
  // El indicador EN EL MOMENTO de la salida por tiempo: al cerrar el día 91, ¿el precio seguía por
  // encima de su SMA50? Es la pieza que permite contrastar «vender por tiempo SALVO que la tendencia
  // siga viva» contra vender siempre. No es look-ahead: solo usa cierres anteriores a ese día.
  // null = la serie no llega al día 91, o no hay 50 cierres previos para la media.
  tendenciaVivaAlSalir: boolean | null
}

const SIN_DATOS: Continuacion = {
  ret182: null, ret364: null,
  mfe364: null, mae364: null, diasMfe364: null,
  tendenciaVivaAlSalir: null,
}

// Helpers inlineados a propósito, como en `salidas.ts`: los módulos puros de `lib/trading` no importan
// valores entre sí (así corren bajo `node --test` sin resolución de módulos). Replican EXACTAMENTE el
// criterio de `backtest-puro.ts` — entrada = último cierre ≤ fecha, horizonte = primer cierre ≥
// fecha+dias — para que estas cifras sean comparables manzana-con-manzana con ret91 y con salidas.ts.
const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function precioEn(puntos: PuntoPrecio[], fecha: string): number | null {
  let out: number | null = null
  for (const p of puntos) {
    if (p.fecha > fecha) break
    out = p.cierre
  }
  return out
}

function retornoForward(puntos: PuntoPrecio[], fecha: string, dias: number): number | null {
  const base = precioEn(puntos, fecha)
  if (base == null || base <= 0) return null
  const objetivo = sumarDias(fecha, dias)
  for (const p of puntos) {
    if (p.fecha >= objetivo) return p.cierre / base - 1
  }
  return null
}

const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

// `salida` es el horizonte de la salida por TIEMPO (el mismo 91 que usan ret91 y simularSalidas), no
// un parámetro suelto: si se cambia allí, hay que cambiarlo aquí o `tendenciaVivaAlSalir` dejaría de
// describir el día en que se vende.
export function medirContinuacion(
  puntos: PuntoPrecio[],
  fecha: string,
  o: { salida?: number; medio?: number; largo?: number } = {},
): Continuacion {
  const salida = o.salida ?? 91
  const medio = o.medio ?? 182
  const largo = o.largo ?? 364

  const entrada = precioEn(puntos, fecha)
  if (entrada == null || entrada <= 0) return SIN_DATOS

  const out: Continuacion = { ...SIN_DATOS }
  out.ret182 = retornoForward(puntos, fecha, medio)
  out.ret364 = retornoForward(puntos, fecha, largo)

  // ── Estado de la tendencia el día que la salida por tiempo vende.
  const objSalida = sumarDias(fecha, salida)
  const previos = puntos.filter(p => p.fecha <= fecha).map(p => p.cierre)
  for (const p of puntos) {
    if (p.fecha <= fecha) continue
    if (p.fecha >= objSalida) {
      // La media se lee con los cierres ANTERIORES a ese día, igual que en salidas.ts: es la que
      // tendría delante quien decide si vender o aguantar.
      if (previos.length >= 50) {
        const sma50 = previos.slice(-50).reduce((a, b) => a + b, 0) / 50
        out.tendenciaVivaAlSalir = p.cierre > sma50
      }
      break
    }
    previos.push(p.cierre)
  }

  // ── Techo y suelo dentro de la ventana larga, incluido el cierre del propio horizonte (el mismo
  // que usa ret364, para que las dos cifras hablen de la misma ventana).
  const objLargo = sumarDias(fecha, largo)
  let completa = false
  let max = -Infinity, min = Infinity, fechaMax = ''
  for (const p of puntos) {
    if (p.fecha <= fecha) continue
    const r = p.cierre / entrada - 1
    if (r > max) { max = r; fechaMax = p.fecha }
    if (r < min) min = r
    if (p.fecha >= objLargo) { completa = true; break }
  }
  if (completa) {
    out.mfe364 = max
    out.mae364 = min
    out.diasMfe364 = diasEntre(fecha, fechaMax)
  }
  return out
}
