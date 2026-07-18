import type { Vela } from './types.ts'
import { indicadoresDe } from './indicadores.ts'
import { torneo } from './estrategias.ts'
import { bajoTendencia } from './riesgo.ts'
import { dimensionar } from './paper.ts'
import { regimenMercado } from './mercado.ts'

// SIMULACIÓN DE CARTERA (paper) walk-forward: a diferencia de backtestSimbolo (un nombre aislado),
// aquí varios símbolos compiten por el MISMO capital, con posiciones concurrentes, sizing por riesgo y
// tope de concentración. Produce la curva de equity y el MAX DRAWDOWN — la métrica honesta que decide
// si el sistema puede pasar a Fase 2 (no basta un retorno positivo: importa cuánto sufre por el camino).
// Long-only, una posición por nombre a la vez, sin apalancar (no gasta más caja de la que hay).
// Requiere velas ALINEADAS por índice (misma rejilla de fechas); cada activo usa velas[i] si existe.

export type OpcionesCartera = {
  navInicial?: number      // capital de partida (default 100_000)
  riesgoPct?: number       // fracción del equity a arriesgar por operación si salta el stop (default 0.01)
  maxPeso?: number         // peso máximo de una posición sobre el equity (default 0.20)
  horizonteDias?: number   // cierre por tiempo (default 10)
  atrMult?: number         // stop = entrada − atrMult·ATR (default 2)
  minVelas?: number        // calentamiento (default 50)
  trailing?: boolean       // stop de arrastre (default false)
  indiceCierres?: number[] // cierres del índice (SPY) alineados: si se da, solo abre en risk-on (SPY>SMA200)
}

export type ResultadoCartera = {
  equityInicial: number
  equityFinal: number
  retornoPct: number
  maxDrawdownPct: number   // peor caída pico→valle de la curva de equity (0..1, positivo)
  nTrades: number
  ganadoras: number
  winRate: number
  curva: number[]          // equity marcado a mercado por barra (desde minVelas)
}

type PosC = { simbolo: string; entradaIdx: number; cantidad: number; precioEntrada: number; stop: number; atrDist: number; maxAlto: number }

export function backtestCartera(activos: { simbolo: string; velas: Vela[] }[], opts: OpcionesCartera = {}): ResultadoCartera {
  const navInicial = opts.navInicial ?? 100_000
  const riesgoPct = opts.riesgoPct ?? 0.01
  const maxPeso = opts.maxPeso ?? 0.20
  const horizonteDias = opts.horizonteDias ?? 10
  const atrMult = opts.atrMult ?? 2
  const minVelas = opts.minVelas ?? 50
  const trailing = opts.trailing ?? false

  let caja = navInicial
  const abiertas = new Map<string, PosC>()
  const curva: number[] = []
  let pico = navInicial, maxDD = 0
  let nTrades = 0, ganadoras = 0
  const maxLen = Math.max(0, ...activos.map(a => a.velas.length))

  const precioDe = (a: { velas: Vela[] }, i: number) => (i < a.velas.length ? a.velas[i].cierre : null)
  const equityEn = (i: number) => {
    let v = caja
    for (const [sim, p] of abiertas) {
      const a = activos.find(x => x.simbolo === sim)!
      const pr = precioDe(a, i)
      v += p.cantidad * (pr ?? p.precioEntrada)   // sin precio hoy, mantiene el último conocido
    }
    return v
  }

  for (let i = minVelas; i < maxLen; i++) {
    // 1) Gestionar posiciones abiertas (stop / horizonte / trailing).
    for (const a of activos) {
      const p = abiertas.get(a.simbolo)
      if (!p || i >= a.velas.length) continue
      const v = a.velas[i]
      if (v.bajo <= p.stop) { caja += p.cantidad * p.stop; if (p.stop > p.precioEntrada) ganadoras++; nTrades++; abiertas.delete(a.simbolo); continue }
      if (i - p.entradaIdx >= horizonteDias) { caja += p.cantidad * v.cierre; if (v.cierre > p.precioEntrada) ganadoras++; nTrades++; abiertas.delete(a.simbolo); continue }
      if (trailing) { p.maxAlto = Math.max(p.maxAlto, v.alto); p.stop = Math.max(p.stop, p.maxAlto - p.atrDist) }
    }

    // 2) Buscar entradas nuevas en los nombres sin posición (equity actual como base de sizing).
    // Filtro de régimen: si hay índice y está risk-off (SPY<SMA200), no se abre nada nuevo esta barra.
    const equityAhora = equityEn(i)
    const riskOn = opts.indiceCierres ? regimenMercado(opts.indiceCierres.slice(0, i + 1)).riskOn : true
    for (const a of activos) {
      if (!riskOn) break
      if (abiertas.has(a.simbolo) || i >= a.velas.length) continue
      const ind = indicadoresDe(a.velas.slice(0, i + 1))
      if (ind.atr14 == null) continue
      const precio = a.velas[i].cierre
      const señales = torneo(ind, {}, a.velas[i].fecha || '')
      const g = [...señales].filter(s => s.direccion !== 'neutral').sort((x, y) => y.confianza - x.confianza)[0]
      if (!g || g.direccion !== 'alcista' || bajoTendencia(precio, ind.sma50)) continue
      const atrDist = atrMult * ind.atr14
      const stop = precio - atrDist
      let cantidad = dimensionar(equityAhora, precio, stop, riesgoPct)
      // Tope de concentración: recorta la cantidad para no pasar del maxPeso del equity.
      const maxCantidadPeso = Math.floor((equityAhora * maxPeso) / precio)
      cantidad = Math.min(cantidad, maxCantidadPeso)
      // No apalancar: no gastar más caja de la disponible.
      cantidad = Math.min(cantidad, Math.floor(caja / precio))
      if (cantidad <= 0) continue
      caja -= cantidad * precio
      abiertas.set(a.simbolo, { simbolo: a.simbolo, entradaIdx: i, cantidad, precioEntrada: precio, stop, atrDist, maxAlto: a.velas[i].alto })
    }

    // 3) Marcar a mercado y registrar drawdown.
    const eq = equityEn(i)
    curva.push(eq)
    if (eq > pico) pico = eq
    const dd = pico > 0 ? (pico - eq) / pico : 0
    if (dd > maxDD) maxDD = dd
  }

  // Cerrar lo que quede al último precio conocido.
  for (const a of activos) {
    const p = abiertas.get(a.simbolo)
    if (!p) continue
    const ult = a.velas[a.velas.length - 1]?.cierre ?? p.precioEntrada
    caja += p.cantidad * ult
    if (ult > p.precioEntrada) ganadoras++
    nTrades++
    abiertas.delete(a.simbolo)
  }

  const equityFinal = caja
  return {
    equityInicial: navInicial,
    equityFinal,
    retornoPct: navInicial > 0 ? equityFinal / navInicial - 1 : 0,
    maxDrawdownPct: maxDD,
    nTrades,
    ganadoras,
    winRate: nTrades ? ganadoras / nTrades : 0,
    curva,
  }
}
