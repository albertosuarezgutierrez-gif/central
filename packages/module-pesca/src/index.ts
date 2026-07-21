// Trazabilidad pesquera (casa de marcas) — entry point único. Lógica PURA:
// sin BD, sin secretos, sin LLM. Modela la recepción de partidas y el envasado por lote de origen.

// Puertos y tipos de dominio
export type {
  Canal,
  MetodoProduccion,
  Partida,
  Envasado,
  PartidaInput,
  EnvasadoInput,
  EtiquetaPayload,
} from './types.ts'

// Reglas y derivados
export {
  redondear2,
  importe,
  pesoEnvasadoTotalKg,
  stockRestanteKg,
  canalLlevaLote,
  CANAL_NOMBRE,
  construirEtiqueta,
  validarPartida,
  validarEnvasado,
} from './pesca.ts'
