// @central/module-trading — lógica pura de análisis de inversión (Fase 1, paper).
export type * from './types.ts'
export { sma, ema, rsi, macd, atr, adx, indicadoresDe, regimenDe } from './indicadores.ts'
export { evaluarMomentum, evaluarReversion, evaluarValor, evaluarCatalizador, torneo } from './estrategias.ts'
export { superaConcentracion, esPromediarPerdedor, superaLimiteOps, earningsInminente, bajoTendencia, factorFlojo } from './riesgo.ts'
export { dimensionar, abrir, aplicarStop, cerrar, pnlPosicion } from './paper.ts'
export { puntuarTesis, agregarStats, ajustesDeStats } from './scoring.ts'
export type { Resultado, StatsEstrategia } from './scoring.ts'
export { rvol, tendenciaVolumen, volumenInusual, confirmaVolumen } from './volumen.ts'
export { infravalorada, pasaScreener, puntuarCandidato, rankearCantera } from './screener.ts'
export { dedupCandidatos, puntuarDescubrimiento, descubrir } from './descubrimiento.ts'
// Cribado del MERCADO ENTERO por métricas (Financial Datasets). Traduce sus filas a `MetricasFactor`
// anulando el ROIC increíble (capital invertido ≈ 0) y los yields fuera de USD, y marca si la
// respuesta llegó al límite —el proveedor ordena por ABECEDARIO, no por calidad.
export { traducirFila, traducirScreener, truncadaPorLimite, ROIC_MAX_CREIBLE } from './screenerMercado.ts'
export type { FilaScreener, FilaTraducida, Traduccion } from './screenerMercado.ts'
// Segunda opinión sobre las cifras de una idea antes de teclear la orden: compara NUESTRA ficha de
// EDGAR contra otra fuente y marca dónde no se puede afirmar nada. No elige ganador.
export { contrastar, avisoContraste, TOLERANCIA_REL } from './contraste.ts'
export type { FichaFundamental, Contraste, ContrasteMetrica, VeredictoMetrica } from './contraste.ts'
export { posicionRango52, tendenciaMedias, fuerzaRelativa, rankearSectores, inclinacionSector, regimenMercado } from './mercado.ts'
export type { SectorRank } from './mercado.ts'
// Riesgo de HUECO y viabilidad del stop: ¿está el stop dentro del ruido normal del valor, y
// cuántas veces lo atravesó un hueco de apertura? (medido, no estimado a ojo).
export { huecos, caidaIntradia, perfilHuecos, evaluarStop, tamanoPorRiesgo } from './riesgo-hueco.ts'
export type { Hueco, PerfilHueco, EvaluacionStop, Veredicto } from './riesgo-hueco.ts'
export { backtestSimbolo, backtestOOS } from './backtest.ts'
export type { TradeBT, ResultadoBacktest, OpcionesBacktest, ResultadoOOS } from './backtest.ts'
export { backtestCartera } from './cartera.ts'
export type { ResultadoCartera, OpcionesCartera } from './cartera.ts'
// Fase B — selección por factores (value + quality + momentum), Piotroski y fórmula mágica.
export { zscores, rankearFactores, momentum12_1 } from './factores.ts'
export type { MetricasFactor, PesosFactor, ScoreFactor } from './factores.ts'
export { piotroskiFScore } from './piotroski.ts'
export type { AnioFinanciero, Piotroski } from './piotroski.ts'
export { rankearMagicFormula } from './magicFormula.ts'
export type { EntradaMagic, RankMagic } from './magicFormula.ts'
export { clasificarMovimiento, movimientosGuru, conviccionGurus, agregarConviccion } from './guru13f.ts'
export type { Holding13F, MovimientoGuru, Cartera13F, ConviccionGuru } from './guru13f.ts'
export { agregarInsiders } from './insiders.ts'
export type { TxInsider, ConviccionInsider } from './insiders.ts'
export { retornoTotal, evaluarCestaVsBench } from './seleccionEval.ts'
export type { RetornoSimbolo, EvalCesta } from './seleccionEval.ts'
export { seleccionCombinada, seleccionSoloGurus } from './seleccion.ts'
export type { EntradaCombinada, ItemCesta, OpcionesSeleccion, ResultadoSeleccion } from './seleccion.ts'
export { retornosDiarios, desviacion, maxDrawdown, curvaCestaEquiponderada, volatilidadAnual, trackingErrorAnual, metricasRiesgoCesta } from './riesgoCesta.ts'
export type { MetricasRiesgo } from './riesgoCesta.ts'
export { retornoVentana, evaluarCestaVsBenchAlineada, curvasAlineadas, metricasRiesgoAlineadas, TOLERANCIA_COBERTURA_DIAS } from './medicionAlineada.ts'
export type { PuntoSerie, EvalCestaAlineada, MetricasRiesgoAlineadas } from './medicionAlineada.ts'
export { rankearUniverso, etiquetaCalidad, diffRanking, snapshotsParaEvaluar, resumenTrackRecord } from './universo.ts'
export type { EmpresaUniverso, ItemRadar, ResultadoRadar, EvaluacionSnapshot } from './universo.ts'
export { rebalancear, valorar } from './carteraCohetes.ts'
export type { CohetePick, Tenencia, Rebalanceo, ValoracionNombre, Valoracion } from './carteraCohetes.ts'
// Tipo de cambio POR FECHA (serie diaria EUR/USD). Sin esto no hay cifra en euros defendible: el
// libro tiene `tipo_cambio` a NULL en casi todas las filas. Nunca mira hacia delante ni rellena.
export { parseFxDailyCsv, indexarFx, resolverTipoCambio, usdAEur, dentroDelRango, MAX_DIAS_ATRAS } from './divisa.ts'
export type { PuntoFx, ResolucionFx } from './divisa.ts'
// Splits: reexpresa las operaciones anteriores a un desdoblamiento en títulos de hoy para que el FIFO
// no empareje mal. `splits === null` = «sin consultar», que NO es «no tiene splits».
export { factorAcumulado, ajustarPorSplits, ajustarSimbolo, parseSplits } from './splits.ts'
export type { Split, OperacionAjustable, Ajuste, EstadoSplits, ResultadoAjuste } from './splits.ts'
