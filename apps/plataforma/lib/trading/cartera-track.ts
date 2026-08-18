// 📈 Serie histórica de la cartera REAL — parte PURA (sin BD). El IO vive en cartera-real-io.ts.
//
// Por qué existe: `trading_cartera_real` es una FOTO que se reemplaza en cada pasada (borrar +
// insertar), y `broker_saldos` es una fila que se pisa. Con ese diseño no hay forma de dibujar la
// evolución: el pasado se destruye cada noche. Esta serie guarda UN punto por día y divisa para
// poder pintar «cuánto llevo puesto» vs «cuánto vale hoy» a lo largo del tiempo (petición de
// Alberto, 18/08/2026, con el núcleo VWCE ya comprado).
//
// Regla del repo aplicada: los importes van POR DIVISA, nunca sumados entre sí (error de unidad,
// PR #1189), y un total al que le falta alguna posición viaja marcado `parcial` — no se pinta como
// si fuera la cartera entera.
// Import SOLO de tipo (se borra en runtime) para que este módulo siga siendo puro y ejecutable con
// `node --test` sin resolver el hermano: quien llama ya trae el resumen calculado.
import type { ResumenDivisa } from './cartera-real'

export type FilaTrack = {
  fecha: string // YYYY-MM-DD (día de la lectura de IBKR)
  divisa: string
  /** Coste de las posiciones con precio medio. null = no se pudo calcular (jamás un 0 inventado). */
  invertido: number | null
  valor: number | null
  pnl: number | null
  /** false = a alguna posición de esa divisa le faltaba valor o coste: el total NO es la cartera entera. */
  completo: boolean
  numPosiciones: number
}

/** Fecha en el huso de Madrid (la pasada corre de noche en España; usar UTC movería de día los
 *  puntos de las pasadas posteriores a medianoche local). */
export function diaMadrid(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Un punto de serie por divisa a partir del resumen de la foto de hoy (`resumenPorDivisa`). Sin
 *  posiciones NO se escribe punto: «leída y vacía» ya lo registra `trading_cartera_real_sync`, y un
 *  0 sin divisa conocida en la curva sería un dato inventado. */
export function filasTrack(resumen: ResumenDivisa[], cuando: Date): FilaTrack[] {
  const fecha = diaMadrid(cuando)
  return resumen.map(r => ({
    fecha,
    divisa: r.divisa,
    invertido: r.invertido,
    valor: r.valor,
    pnl: r.pnl,
    completo: r.completo,
    numPosiciones: r.n,
  }))
}

export type PuntoSerie = {
  fecha: string
  valor: number
  invertido: number | null
  /** Rentabilidad sobre el coste. null si falta el coste (no se dibuja un 0%). */
  rentabilidad: number | null
  parcial: boolean
}

export type SerieCartera = {
  divisa: string
  puntos: PuntoSerie[]
  /** Puntos de la divisa que se descartaron por no traer valor de mercado — se DECLARAN, no se ocultan. */
  sinValor: number
  /** Cuántos de los puntos dibujados son totales parciales. */
  parciales: number
}

/** Prepara la serie de UNA divisa para pintarla. Los puntos sin `valor` no se dibujan (no hay nada
 *  que situar en el eje) pero se cuentan, para que el pie del gráfico pueda decir que faltan. */
export function serieCartera(filas: FilaTrack[], divisa: string): SerieCartera {
  const dela = filas.filter(f => f.divisa === divisa).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const puntos: PuntoSerie[] = []
  let sinValor = 0
  for (const f of dela) {
    if (f.valor == null) { sinValor++; continue }
    puntos.push({
      fecha: f.fecha,
      valor: f.valor,
      invertido: f.invertido,
      rentabilidad: f.invertido != null && f.invertido > 0 ? (f.valor - f.invertido) / f.invertido : null,
      parcial: !f.completo,
    })
  }
  return { divisa, puntos, sinValor, parciales: puntos.filter(p => p.parcial).length }
}

/** Divisas presentes en la serie, la de más peso primero (por el valor del último punto). */
export function divisasDeTrack(filas: FilaTrack[]): string[] {
  const ultimo = new Map<string, number>()
  for (const f of [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    if (f.valor != null) ultimo.set(f.divisa, f.valor)
  }
  const resto = [...new Set(filas.map(f => f.divisa))].filter(d => !ultimo.has(d))
  return [...[...ultimo.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d), ...resto]
}
