// @central/module-feedback — Feedback genérico de la casa de marcas.
// Reseñas/valoraciones y propinas (token o Encargo) + agregación. Cada vertical aporta su
// adaptador. Ver docs/DISENO-modularizacion-verticales.md.

export type {
  ParentType,
  ParentRef,
  EstadoFeedback,
  EstadoPropina,
  Feedback,
  Propina,
  ResumenValoraciones,
  FeedbackAdapter,
  PropinaAdapter,
} from './types'

export { round2, resumenValoraciones, totalPropinas, propinasPagadas } from './logic'
