// Tipos (PORT del módulo — cada vertical normaliza sus turnos a TurnoFichaje)
export type {
  TurnoFichaje,
  LimitesJornada,
  ExcesoJornada,
  ResumenJornadaEmpleado,
  AvisoDescanso,
  ResumenHorasExtra,
  PuntoSerieJornada,
  CostePersonalLinea,
  CostePersonal,
} from './types'

// Jornada legal (RD 8/2019): registro, descansos, horas extra, coste de personal
export {
  LIMITES_DEFECTO,
  isoWeek,
  resumenJornada,
  detalleJornada,
  chequearDescansos,
  horasExtra,
  costePersonal,
} from './jornada'
