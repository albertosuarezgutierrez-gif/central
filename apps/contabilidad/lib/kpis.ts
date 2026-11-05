// KPI del panel (spec 7ter): la lógica vive en @central/module-contabilidad (pura, con sus tests); aquí solo se reexporta para la app.
// 🚨 `null` = «sin datos», nunca 0. Fórmulas documentadas en packages/module-contabilidad/src/analisis/kpis.ts.
export {
  calcularKpis, variacion, variacionPct, comparar, tarjetasKpi, rangoPeriodo, periodoAnterior, mismoPeriodoAnioAnterior, rangosComparativa,
  esTipoPeriodo,
} from '@central/module-contabilidad'
export type { Kpis, ClaveKpi, TipoPeriodo, Rango, Comparacion, TarjetaKpi } from '@central/module-contabilidad'
