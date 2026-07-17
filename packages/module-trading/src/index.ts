// @central/module-trading — lógica pura de análisis de inversión (Fase 1, paper).
export type * from './types.ts'
export { sma, ema, rsi, macd, atr, indicadoresDe, regimenDe } from './indicadores.ts'
export { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from './estrategias.ts'
