// Tipos (PORT del módulo — cada vertical normaliza sus turnos a TurnoFichaje)
export type {
  TurnoFichaje,
  LimitesJornada,
  ExcesoJornada,
  ResumenJornadaEmpleado,
  AvisoDescanso,
  ResumenHorasExtra,
  PuntoSerieJornada,
} from './types'

// Jornada legal (RD 8/2019): registro, descansos, horas extra
export {
  LIMITES_DEFECTO,
  isoWeek,
  resumenJornada,
  detalleJornada,
  chequearDescansos,
  horasExtra,
} from './jornada'
