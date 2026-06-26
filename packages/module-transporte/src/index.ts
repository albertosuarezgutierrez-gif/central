// @central/module-transporte — Transporte (camiones como negocio) de la casa de marcas.
// Una de las dos verticales "nuevas" del diseño (la otra es alquiler de materiales): se COMPONE
// sobre el agregado genérico Encargo (tipo 'porte') y sobre @central/module-flota (vehículos/portes,
// por id). Modela el SERVICIO/ORDEN de transporte tanto INTERNO a otro negocio del grupo (candidato
// a eliminación intercompany) como EXTERNO a un cliente tercero (ingreso real). Lógica pura: precio
// del servicio (importe pactado o derivado del coste de los portes + margen), máquina de estados,
// resumen y consolidación intercompany. Sin BD; cada vertical aporta su ServicioAdapter.
// Ver docs/DISENO-modulos-materiales-flota.md §4.

export type {
  EstadoServicio,
  ParentRef,
  ServicioTransporte,
  NuevoServicioTransporte,
  ResumenServicios,
  OperacionIntercompanyDeTransporte,
  ServicioAdapter,
} from './types'

export {
  round2,
  ESTADOS,
  ESTADOS_ACTIVOS,
  TRANSICIONES,
  puedeTransicionar,
  transicionar,
  importeServicio,
  costeDePortes,
  sugerirImporte,
  margenServicio,
  esIntercompany,
  totalIntercompany,
  operacionIntercompanyDe,
  resumenServicios,
} from './transporte'
