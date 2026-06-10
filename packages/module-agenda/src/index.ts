// @iarest/module-agenda — Agenda/disponibilidad genérica de la casa de marcas.
// Reserva de recursos (hacienda/vehículo/kit/sala/persona) con detección de solapes.
// Contrato para venues, flota, alquiler y citas. Ver docs/DISENO-modularizacion-verticales.md
// y docs/DISENO-modulos-materiales-flota.md.

export type {
  ParentType,
  ParentRef,
  TipoRecurso,
  EstadoReserva,
  Recurso,
  Intervalo,
  Reserva,
  RecursoAdapter,
  ReservaAdapter,
} from './types'

export { haySolape, recursoDisponible, recursosDisponibles } from './disponibilidad'
