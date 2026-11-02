/**
 * @central/module-cima — lógica PURA de la ingesta CIMA/EIAC (sin BD ni red),
 * portada del CRM (`asegura/src/lib/integrations/cima/`, fase 1 de
 * docs/superpowers/specs/2026-11-02-unificar-ingesta-cima.md).
 *
 * Mismo barrel que el CRM SIN `client` (HTTP del adaptador Fly), `pull-persist` y
 * `pull-deps` (BD): esos llegan en la fase 2. El resto de módulos (mappers REC/SIN/CEF,
 * matching, figuras, cobertura…) se importan por subruta: `@central/module-cima/<fichero>`.
 */
export {
  getCimaAdapterConfig,
  assertCimaAdapterCallable,
  isCimaAdapterConfigured,
  CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH,
  CIMA_ADAPTER_DEFAULT_TIMEOUT_MS,
  type CimaAdapterConfig,
} from "./config.ts";

export {
  JUNK_POLIZA_NUMBERS,
  MIN_PLAUSIBLE_POLIZA_LENGTH,
  NON_CIMA_CARRIERS,
  normalizeText,
  normalizePolizaNumber,
  isCimaRoutableCarrier,
  buildFallbackKey,
  classifyPolizaForCima,
  matchIncomingCimaPoliza,
  type PolizaReconcileClass,
  type PolizaMatchInput,
  type PolizaClassification,
  type MatchAction,
  type IncomingCimaPoliza,
  type MatchResult,
} from "./poliza-matching.ts";

export {
  CIMA_SUCCESS_CODE,
  CIMA_ESTADO_PROCESO_FINALIZADO,
  isCimaSuccess,
  ficheroParseadoSchema,
  recibirFicherosEnvelopeSchema,
  recibirFicheroResponseSchema,
  confirmarDescargaResponseSchema,
  parseRecibirFicherosResponse,
  parseRecibirFicheroResponse,
  parseConfirmarDescargaResponse,
  type FicheroParseado,
  type RecibirFicherosEnvelope,
  type RecibirFicheroResponse,
  type ConfirmarDescargaResponse,
  type WseParseResult,
  type RejectedFichero,
  type RecibirFicherosParseResult,
  type ConfirmarDescargaParseResult,
} from "./wse-schemas.ts";

export {
  asArray,
  toIsoDate,
  classifyTipoSeguro,
  mapEiacPol,
  mapEiacPolAll,
  type EiacPolOutcome,
  type EiacTipoSeguro,
  type TipoPersona,
  type TipoIdentificacion,
  type MappedTomador,
  type MappedInterviniente,
  type EiacIntervinienteRol,
  type EiacPolMapped,
  type ParsedPersona,
  type ParsedRiesgo,
  type ParsedPoliza,
  type ParsedEiacPol,
} from "./eiac-pol-mapper.ts";

export {
  runCimaPull,
  type CimaFicheroFsmEstado,
  type LedgerEntry,
  type ResolveClienteResult,
  type PersistInput,
  type PersistResult,
  type CimaPullDeps,
  type CimaPullOptions,
  type FicheroOutcome,
  type CimaPullResult,
} from "./ingest-pipeline.ts";

export {
  isCimaIngestaEnabled,
  decideCimaPullMode,
  type CimaPullMode,
} from "./ingest-flag.ts";

export {
  classifyConfirmarDescargaAck,
  seguirFusionHastaSuperviviente,
  isCodigoEntidadAutorizado,
  getIngestaCodigosEntidad,
  splitNombreCompleto,
  unwrapCimaWseEnvelope,
  MAX_SALTOS_FUSION,
  type ConfirmarDescargaHttpResponse,
  type NodoFusion,
} from "./pull-puro.ts";
