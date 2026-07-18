import type { Indicadores, Fundamentales, Senal } from './types.ts'

export function evaluarMomentum(ind: Indicadores): Senal {
  const cruceAlcista = ind.ema12 !== null && ind.ema26 !== null && ind.ema12 > ind.ema26
  const macdAlcista = ind.macd !== null && ind.macdSignal !== null && ind.macd > ind.macdSignal
  const adx = ind.adx14
  const fuerte = adx != null && adx >= 25       // tendencia fuerte → más confianza
  const hayTendencia = adx != null && adx >= 20  // SUELO: por debajo no hay tendencia que seguir
  const base = `ema12${cruceAlcista ? '>' : '<='}ema26, macd${macdAlcista ? '>' : '<='}signal`
  // El momentum SOLO opera con tendencia real (ADX≥20). La lección del backtest: sin este suelo, el
  // cruce EMA/MACD dispara en ruido lateral (ema12>ema26 y macd>signal son casi la misma condición, la
  // línea MACD ES ema12−ema26) → entradas de baja calidad que perdían. Sin ADX (serie corta) tampoco opera.
  if (!hayTendencia) {
    const nota = adx != null ? `, adx ${adx.toFixed(0)} (<20: sin tendencia)` : ', sin adx'
    return { estrategia: 'momentum', direccion: 'neutral', confianza: 40, rationale: `${base}${nota}` }
  }
  let direccion: Senal['direccion'] = 'neutral', confianza = 40
  if (cruceAlcista && macdAlcista) { direccion = 'alcista'; confianza = fuerte ? 78 : 68 }
  else if (!cruceAlcista && !macdAlcista) { direccion = 'bajista'; confianza = fuerte ? 70 : 60 }
  return { estrategia: 'momentum', direccion, confianza, rationale: `${base}, adx ${adx!.toFixed(0)}` }
}

export function evaluarReversion(ind: Indicadores): Senal {
  const r = ind.rsi14
  // La reversión a la media funciona en RANGO, no contra una tendencia fuerte. Si el ADX marca
  // tendencia fuerte, un RSI extremo NO es una entrada: es un cuchillo cayendo (la lección de ISRG).
  const tendenciaFuerte = ind.adx14 != null && ind.adx14 >= 25
  let direccion: Senal['direccion'] = 'neutral', confianza = 40, nota = 'rsi neutral'
  if (r !== null && r < 30) {
    if (tendenciaFuerte) { direccion = 'neutral'; confianza = 45; nota = `rsi ${r.toFixed(0)} sobreventa pero ADX ${ind.adx14!.toFixed(0)} (tendencia fuerte = no fadear)` }
    else { direccion = 'alcista'; confianza = 70; nota = `rsi ${r.toFixed(0)} sobreventa` }
  } else if (r !== null && r > 70) {
    if (tendenciaFuerte) { direccion = 'neutral'; confianza = 45; nota = `rsi ${r.toFixed(0)} sobrecompra pero ADX ${ind.adx14!.toFixed(0)} (tendencia fuerte)` }
    else { direccion = 'bajista'; confianza = 70; nota = `rsi ${r.toFixed(0)} sobrecompra` }
  }
  return { estrategia: 'reversion', direccion, confianza, rationale: nota }
}

export function evaluarValor(f: Fundamentales): Senal {
  if (f.per === undefined) return { estrategia: 'valor', direccion: 'neutral', confianza: 30, rationale: 'sin fundamentales' }
  const barato = f.per > 0 && f.per < 15
  const sano = (f.deudaEbitda ?? 99) < 3 && (f.margenNeto ?? 0) > 0.1
  const direccion = barato && sano ? 'alcista' : (f.per > 40 ? 'bajista' : 'neutral')
  return { estrategia: 'valor', direccion, confianza: barato && sano ? 65 : 45, rationale: `PER ${f.per}, deuda/EBITDA ${f.deudaEbitda ?? '?'}` }
}

export function evaluarCatalizador(f: Fundamentales, hoy: string): Senal {
  if (!f.proximoEarnings) return { estrategia: 'catalizador', direccion: 'neutral', confianza: 30, rationale: 'sin earnings próximos' }
  const dias = (new Date(f.proximoEarnings).getTime() - new Date(hoy).getTime()) / 86_400_000
  const inminente = dias >= 0 && dias <= 5
  return {
    estrategia: 'catalizador',
    direccion: inminente ? 'alcista' : 'neutral',
    confianza: inminente ? 55 : 35,
    rationale: inminente ? `earnings en ${Math.round(dias)}d` : 'earnings lejano',
  }
}

// `ajustes` = delta de confianza por estrategia (de su rendimiento histórico real, ver ajustesDeStats).
// Se aplica DESPUÉS de evaluar, solo a señales direccionales, y acotado a [0,100]: el bucle de
// aprendizaje sube la confianza de lo que acierta y baja la de lo que falla, sin reescribir las reglas.
export function torneo(ind: Indicadores, f: Fundamentales, hoy: string, ajustes?: Record<string, number>): Senal[] {
  const señales = [evaluarMomentum(ind), evaluarReversion(ind), evaluarValor(f), evaluarCatalizador(f, hoy)]
  if (!ajustes) return señales
  return señales.map(s => {
    const d = ajustes[s.estrategia] ?? 0
    if (!d || s.direccion === 'neutral') return s
    return { ...s, confianza: Math.max(0, Math.min(100, s.confianza + d)) }
  })
}
