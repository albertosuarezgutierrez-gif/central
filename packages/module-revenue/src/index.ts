// @central/module-revenue — análisis de demanda puro y agnóstico de dominio.
// Fase 1: analítica (solo lectura). Fase 2 añadirá recommendFactors + backtest.

export type {
  DemandEvent,
  CapacitySlot,
  AnalysisConfig,
  DowOccupancy,
  MonthSeasonality,
  LeadTimeStats,
  PickupPoint,
  PaceResult,
  ChannelShare,
  RevenueKpis,
} from './types'

export { occupancyByDow, seasonalityByMonth } from './occupancy'
export { leadTimeStats, pickupCurve, paceVsBaseline } from './demand'
export { channelMix, revenueKpis } from './revenue'
