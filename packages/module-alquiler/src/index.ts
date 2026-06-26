// @central/module-alquiler — Alquiler de materiales/menaje de la casa de marcas.
// Una de las dos verticales "nuevas" del diseño (la otra es transporte/flota): se COMPONE sobre
// el agregado genérico Encargo y referencia los materiales por id. Modela el alquiler tanto
// INTERNO a un evento del grupo (candidato a eliminación intercompany) como EXTERNO a un cliente
// tercero (ingreso real). Lógica pura: precio por días, máquina de estados de fulfillment, recargo
// por retraso, disponibilidad por solape de fechas y consolidación intercompany. Sin BD; cada
// vertical aporta su AlquilerAdapter. Ver docs/DISENO-modulos-materiales-flota.md.

export type {
  EstadoAlquiler,
  ParentRef,
  LineaAlquiler,
  Alquiler,
  NuevoAlquiler,
  ResumenAlquileres,
  OperacionIntercompanyDeAlquiler,
  AlquilerAdapter,
} from './types'

export {
  round2,
  ESTADOS,
  ESTADOS_ACTIVOS,
  TRANSICIONES,
  puedeTransicionar,
  transicionar,
  diasAlquiler,
  importeLinea,
  subtotal,
  totalAlquiler,
  diasRetraso,
  recargoRetraso,
  solapa,
  comprometidoEnVentana,
  disponibleEnVentana,
  esIntercompany,
  totalIntercompany,
  operacionIntercompanyDe,
  resumenAlquileres,
} from './alquiler'
