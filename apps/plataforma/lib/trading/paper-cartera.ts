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
  {
    // Congelada el 17/08/2026 — COHORTE 3, pata COMBINADA (hipótesis H5 del pre-registro): primera cohorte
    // desde el UNIVERSO AMPLIO — /api/trading/seleccion {"universo":"sp500"} (883 candidatos de la caché del
    // radar, gestores con datos BRK/psc/ic/DA). Antes las cohortes salían solo de la watchlist de gurús;
    // por eso esta cesta ya no coincide con las de julio.
    version: '2026-08-17.v1',
    fechaInicio: '2026-08-17',
    benchmark: 'SPY',
    metodo: 'gurús (Dataroma) ∩ calidad (Piotroski≥6 + ROIC≥10%) sobre universo sp500 — /api/trading/seleccion, equiponderada · con cesta base gurús-solo para atribución',
    params: { minPiotroski: 6, minRoic: 0.10, tam: 25 },
    simbolos: ['SPGI', 'MA', 'NFLX', 'V', 'APP', 'MSFT', 'GOOGL', 'DAL', 'ALSN', 'WWD', 'BSY', 'STE', 'VMC', 'NDAQ', 'DPZ', 'AAPL', 'IDXX', 'STX', 'LRCX', 'ASML', 'TPR', 'AU', 'CTAS', 'FTI', 'TT'],
    simbolosBase: ['SPGI', 'V', 'MA', 'META', 'NFLX', 'DHI', 'UBER', 'DAL', 'QSR', 'BKNG', 'RPRX', 'LYV', 'DHR', 'APP', 'LEN', 'GOOGL', 'MSFT', 'CGNX', 'XYZ', 'RDY', 'APA', 'COR', 'MAA', 'TW', 'ARW'],
  },
  {
    // Congelada el 17/08/2026 — COHORTE 3, pata FACTORES-SOLO (H5, atribución completa): los 10 primeros
    // por score de factores PUROS (rankearUniverso: valor+calidad+momentum en z-scores) sobre la MISMA
    // caché neutralizada que la pata combinada, SIN gurús y SIN la puerta minPiotroski/minRoic (params a 0
    // = sin umbral; la elegibilidad es solo tener piotroski+roic y algún dato de valor). Es la tercera
    // pata que faltaba para atribuir qué aporta cada pilar con datos forward: gurús-solo (simbolosBase de
    // la combinada) vs gurús∩calidad (combinada) vs factores-solo (esta). Se evalúa por MEDIANA a
    // 28/56/91 días, las tres contra SPY y entre sí (pre-registro H5). Desde este PR la devuelve
    // /api/trading/seleccion en `simbolosFactores`; esta primera se calculó el mismo día con el mismo
    // pipeline (neutralizarUniverso + rankearUniverso top-10) sobre la caché viva.
    version: '2026-08-17.factores.v1',
    fechaInicio: '2026-08-17',
    benchmark: 'SPY',
    metodo: 'factores-solo (H5): top-10 por score de factores puros (rankearUniverso) sobre universo sp500, sin gurús ni puerta de calidad, equiponderada',
    params: { minPiotroski: 0, minRoic: 0, tam: 10 },
    simbolos: ['SNDK', 'BKNG', 'MU', 'WDC', 'NLY', 'STX', 'CMCSA', 'MOH', 'VICR', 'UMBF'],
  },
]

// La cohorte más reciente (para avisos de cadencia y compat con consumidores de una sola cesta).
export const COHORTE_ULTIMA: CarteraPaper = COHORTES_PAPER[COHORTES_PAPER.length - 1]

// Compat: durante la fase de una sola cesta el resto del código consumía `CARTERA_PAPER`. Se mantiene
// apuntando a la PRIMERA cohorte para no romper llamadas antiguas; el tracker ya itera `COHORTES_PAPER`.
export const CARTERA_PAPER: CarteraPaper = COHORTES_PAPER[0]
