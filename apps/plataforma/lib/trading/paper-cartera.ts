// CARTERA PAPER (forward test, Fase B) — cestas de SELECCIÓN COMBINADA (gurús ∩ calidad) CONGELADAS, cada
// una en una fecha. A partir de su `fechaInicio` la medición es OUT-OF-SAMPLE de verdad: el futuro aún no
// ha pasado, así que NO hay look-ahead ni sesgo de supervivencia. Las sigue `/api/trading/paper` contra el
// SPY con precios gratis (Stooq→Yahoo). Es la prueba limpia que decide el paso a dinero real. SOLO paper.
//
// COHORTES (idea 1 de robustez): en vez de UNA sola cesta —cuyo punto de entrada pudo ser afortunado y
// mentiría igual que el backtest— congelamos una cesta NUEVA cada ~mes. Cada cohorte es una muestra
// independiente con su propio reloj; que 3-4 cohortes batan al SPY es mucho más difícil de explicar por
// suerte que una sola. Congelar una cohorte = añadir una entrada a `COHORTES_PAPER` (cambio deliberado y
// auditable en el repo: la cesta congelada NO se puede reescribir a posteriori). El tracker recuerda por
// Telegram cuándo toca congelar la siguiente (ver `paper-tracker.ts`).
export type CarteraPaper = {
  version: string
  fechaInicio: string      // YYYY-MM-DD — arranca el reloj sin sesgo
  benchmark: string
  metodo: string
  params: { minPiotroski: number; minRoic: number; tam: number }
  simbolos: string[]       // cesta COMBINADA (gurús ∩ calidad), equiponderada
  // Atribución (idea 4): cesta gurús-SOLO (sin la puerta de calidad) congelada en la MISMA fecha. 2º
  // benchmark: si la combinada no bate a esta, el filtro Piotroski/ROIC no aporta. La devuelve
  // `/api/trading/seleccion` en `simbolosBase` — cópiala aquí al congelar la cohorte. Opcional: las
  // cohortes antiguas sin ella simplemente no muestran la línea de atribución.
  simbolosBase?: string[]
}

// Cadencia objetivo entre cohortes (días). El tracker avisa cuando la última cohorte supera este umbral.
export const DIAS_ENTRE_COHORTES = 30

// Lista de cohortes, de la MÁS ANTIGUA a la más nueva. Nunca se edita una entrada existente (rompería el
// out-of-sample); solo se AÑADE una nueva al final cuando toca congelar.
export const COHORTES_PAPER: CarteraPaper[] = [
  {
    // Congelada el 18/07/2026: resultado de /api/trading/seleccion {tam:25} (minPiotroski 6, minRoic 0,10).
    // En el backtest CON look-ahead (2023→hoy) la MEDIANA batió al SPY (+159,9% vs +95,2%; 8/8 en verde,
    // 6/8 sobre el índice) — por eso se congela y se mide su rendimiento REAL hacia delante.
    version: '2026-07-18.v1',
    fechaInicio: '2026-07-18',
    benchmark: 'SPY',
    metodo: 'gurús (Dataroma) ∩ calidad (Piotroski≥6 + ROIC≥10%) — /api/trading/seleccion, equiponderada',
    params: { minPiotroski: 6, minRoic: 0.10, tam: 25 },
    simbolos: ['MSFT', 'APP', 'DAL', 'CVI', 'NYT', 'LYV', 'GOOG', 'AMZN'],
  },
  {
    // Congelada el 19/07/2026 (reloj desde el 20, apertura de bolsa): /api/trading/seleccion {tam:25}
    // (minPiotroski 6, minRoic 0,10), gestores con datos BRK/psc/ic/DA, 14 con fundamentales. La combinada
    // coincide con la cohorte 1 (misma selección de estos días); el valor nuevo es `simbolosBase` (gurús-solo)
    // → ATRIBUCIÓN del filtro de calidad, y un 2º punto de entrada. Sin look-ahead: se mide desde `fechaInicio`.
    version: '2026-07-20.v1',
    fechaInicio: '2026-07-20',
    benchmark: 'SPY',
    metodo: 'gurús (Dataroma) ∩ calidad (Piotroski≥6 + ROIC≥10%) — /api/trading/seleccion, equiponderada · con cesta base gurús-solo para atribución',
    params: { minPiotroski: 6, minRoic: 0.10, tam: 25 },
    simbolos: ['MSFT', 'APP', 'DAL', 'CVI', 'NYT', 'LYV', 'GOOG', 'AMZN'],
    simbolosBase: ['DAL', 'M', 'MSFT', 'SUNB', 'APP', 'SPGI', 'NYT', 'GOOG', 'LEN', 'LEN.B', 'AMZN', 'UBER', 'CVI', 'SD', 'RPRX', 'LYV', 'BKNG'],
  },
]

// La cohorte más reciente (para avisos de cadencia y compat con consumidores de una sola cesta).
export const COHORTE_ULTIMA: CarteraPaper = COHORTES_PAPER[COHORTES_PAPER.length - 1]

// Compat: durante la fase de una sola cesta el resto del código consumía `CARTERA_PAPER`. Se mantiene
// apuntando a la PRIMERA cohorte para no romper llamadas antiguas; el tracker ya itera `COHORTES_PAPER`.
export const CARTERA_PAPER: CarteraPaper = COHORTES_PAPER[0]
