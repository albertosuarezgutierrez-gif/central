// @central/module-crm — CRM/pipeline genérico de la casa de marcas.
// Contrato (tipos + puertos) que cada vertical implementa con un adaptador y un
// repositorio. IMPLEMENTADO Y CONSUMIDO: ia-rest (apps/ia-rest/src/lib/crm-eventos.ts,
// LeadsEventoAdapter sobre `leads_evento`) e ialimp (su adaptador de `leads`).
// Ver docs/ESTRUCTURA.md (inventario vivo) y docs/DISENO-modularizacion-verticales.md.

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
