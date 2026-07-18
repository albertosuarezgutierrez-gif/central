// CARTERA PAPER (forward test, Fase B) — la cesta de SELECCIÓN COMBINADA (gurús ∩ calidad) CONGELADA en
// una fecha. A partir de `fechaInicio` la medición es OUT-OF-SAMPLE de verdad: el futuro aún no ha pasado,
// así que NO hay look-ahead ni sesgo de supervivencia. La sigue `/api/trading/paper` contra el SPY con
// precios gratis (Stooq→Yahoo). Es la prueba limpia que decide el paso a dinero real. SOLO paper.
//
// Congelada el 18/07/2026: resultado de /api/trading/seleccion {tam:25} (minPiotroski 6, minRoic 0,10).
// En el backtest CON look-ahead (2023→hoy) la MEDIANA batió al SPY (+159,9% vs +95,2%; 8/8 en verde,
// 6/8 sobre el índice) — por eso se congela y se mide su rendimiento REAL hacia delante.
export type CarteraPaper = {
  version: string
  fechaInicio: string      // YYYY-MM-DD — arranca el reloj sin sesgo
  benchmark: string
  metodo: string
  params: { minPiotroski: number; minRoic: number; tam: number }
  simbolos: string[]       // equiponderadas
}

export const CARTERA_PAPER: CarteraPaper = {
  version: '2026-07-18.v1',
  fechaInicio: '2026-07-18',
  benchmark: 'SPY',
  metodo: 'gurús (Dataroma) ∩ calidad (Piotroski≥6 + ROIC≥10%) — /api/trading/seleccion, equiponderada',
  params: { minPiotroski: 6, minRoic: 0.10, tam: 25 },
  simbolos: ['MSFT', 'APP', 'DAL', 'CVI', 'NYT', 'LYV', 'GOOG', 'AMZN'],
}
