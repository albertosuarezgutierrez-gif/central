import type { PuntoPrecio } from './precios-stooq'

// Parte PURA del retrovisor (backtest punto-en-el-tiempo): fechas de snapshot, precios/retornos
// sobre una serie con fechas. SOLO type-imports locales (node --test no resuelve relativos sin
// extensión): `factoresEnFecha` — que necesita edgar+módulo en runtime — vive en `backtest.ts`.

export const VENTANAS_FORWARD = [28, 56, 91] as const

export const sumarDias = (fecha: string, n: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Fechas de snapshot: día 1 de cada mes, desde hace `meses` hasta hace `margenDias` (para que la
// ventana forward más larga quepa entera en la serie de precios).
export function fechasSnapshot(hoy: string, meses = 24, margenDias = 98): string[] {
  const [y, m] = hoy.split('-').map(Number)
  const limite = sumarDias(hoy, -margenDias)
  const out: string[] = []
  for (let i = meses; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i
    const fecha = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
    if (fecha <= limite) out.push(fecha)
  }
  return out
}

// Último cierre con fecha <= objetivo (los snapshots caen en festivos/fin de semana sin cotización).
export function precioEn(puntos: PuntoPrecio[], fecha: string): number | null {
  let ultimo: number | null = null
  for (const p of puntos) {
    if (p.fecha > fecha) break
    ultimo = p.cierre
  }
  return ultimo
}

// Retorno desde `fecha` al primer cierre >= fecha+dias. null si la serie no llega o no hay base.
export function retornoForward(puntos: PuntoPrecio[], fecha: string, dias: number): number | null {
  const base = precioEn(puntos, fecha)
  if (base == null || base <= 0) return null
  const objetivo = sumarDias(fecha, dias)
  for (const p of puntos) {
    if (p.fecha >= objetivo) return p.cierre / base - 1
  }
  return null
}

export type FactoresFecha = {
  piotroski: number | null; roic: number | null; ey: number | null; momentum: number | null
  // FCF yield = (CFO − capex) / mktCap — candidata a completar el pilar de valor (hipótesis H4 del
  // pre-registro): se RECOLECTA para medir su spread en el retrovisor; NO se cablea al blend sin señal.
  fcfy?: number | null
  precio: number | null; ret28: number | null; ret56: number | null; ret91: number | null
  // Medias móviles multi-marco (idea de Alberto para el satélite 🚀): ¿el precio está por ENCIMA de
  // la SMA30 del gráfico SEMANAL y de la SMA12 del MENSUAL (la media "anual")? null = serie corta.
  sobreSmaSem?: boolean | null
  sobreSmaMes?: boolean | null
  // Vela + volumen (hipótesis H8 del pre-registro, 04/08/2026): capitulación = caída ≥25% del máximo
  // de las 12 barras anteriores CON volumen ≥1,5× su media. Se RECOLECTA en los dos marcos para
  // medir su spread punto-en-el-tiempo sobre el universo entero; NO toca ranking ni cestas hasta que
  // H8 se resuelva. `null` = no se puede saber (serie corta o fuente sin volumen), NO «no salta».
  capitulacionMes?: boolean | null
  caidaMes?: number | null
  volRelMes?: number | null
  capitulacionSem?: boolean | null
  caidaSem?: number | null
  volRelSem?: number | null
}

// Remuestrea una serie diaria al cierre de cada PERIODO ('sem' = semana ISO aprox por lunes,
// 'mes' = mes natural), hasta `hasta` inclusive. El cierre del periodo = último cierre diario en él.
export function cierresPeriodicos(puntos: PuntoPrecio[], hasta: string, periodo: 'sem' | 'mes'): number[] {
  const out: number[] = []
  let claveActual = ''
  for (const p of puntos) {
    if (p.fecha > hasta) break
    let clave: string
    if (periodo === 'mes') clave = p.fecha.slice(0, 7)
    else {
      const d = new Date(`${p.fecha}T00:00:00Z`)
      const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000)
      clave = lunes.toISOString().slice(0, 10)
    }
    if (clave === claveActual) out[out.length - 1] = p.cierre
    else { out.push(p.cierre); claveActual = clave }
  }
  return out
}

// SMA del ÚLTIMO punto de la serie (media de los n últimos cierres). null si no hay n puntos.
export function ultimaSma(cierres: number[], n: number): number | null {
  if (n <= 0 || cierres.length < n) return null
  let suma = 0
  for (let i = cierres.length - n; i < cierres.length; i++) suma += cierres[i]
  return suma / n
}

// ¿Último cierre por encima de su SMA n en ese marco temporal? null si la serie no da para la media.
export function sobreSma(cierres: number[], n: number): boolean | null {
  const s = ultimaSma(cierres, n)
  if (s == null) return null
  return cierres[cierres.length - 1] > s
}
