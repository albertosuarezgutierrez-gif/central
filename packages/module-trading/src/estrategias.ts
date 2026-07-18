import type { Indicadores, Fundamentales, Senal } from './types.ts'

export function evaluarMomentum(ind: Indicadores): Senal {
  const cruceAlcista = ind.ema12 !== null && ind.ema26 !== null && ind.ema12 > ind.ema26
  const macdAlcista = ind.macd !== null && ind.macdSignal !== null && ind.macd > ind.macdSignal
  const fuerte = ind.adx14 != null && ind.adx14 >= 25   // ADX confirma que la tendencia tiene fuerza
  let direccion: Senal['direccion'] = 'neutral', confianza = 40
  if (cruceAlcista && macdAlcista) { direccion = 'alcista'; confianza = fuerte ? 78 : 68 }
  else if (!cruceAlcista && !macdAlcista) { direccion = 'bajista'; confianza = fuerte ? 70 : 60 }
  const notaAdx = ind.adx14 != null ? `, adx ${ind.adx14.toFixed(0)}` : ''
  return { estrategia: 'momentum', direccion, confianza, rationale: `ema12${cruceAlcista ? '>' : '<='}ema26, macd${macdAlcista ? '>' : '<='}signal${notaAdx}` }
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

export function torneo(ind: Indicadores, f: Fundamentales, hoy: string): Senal[] {
  return [evaluarMomentum(ind), evaluarReversion(ind), evaluarValor(f), evaluarCatalizador(f, hoy)]
}
