// @central/module-crm — CRM/pipeline genérico de la casa de marcas.
// Contrato (tipos + puertos) que cada vertical implementa con un adaptador y un
// repositorio. La extracción real desde ia-rest (LeadsEventoAdapter sobre `leads_evento`)
// se hace en una ronda posterior; ver docs/DISENO-modularizacion-verticales.md.

// Tipos y puertos
export type {
  EstadoOportunidad,
  ParentType,
  ParentRef,
  Oportunidad,
  NuevaOportunidad,
  FiltroOportunidad,
  OportunidadRepository,
  OportunidadAdapter,
  ResumenPipeline,
} from './types'

// Lógica de pipeline (pura)
export {
  PROBABILIDAD_POR_ESTADO,
  ESTADOS,
  ESTADOS_ABIERTOS,
  round2,
  probabilidad,
  valorPonderado,
  resumenPipeline,
} from './pipeline'
