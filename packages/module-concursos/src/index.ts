// Módulo de Concursos Públicos (casa de marcas) — entry point único.
// Lógica pura: el LLM entra por el puerto AiRunner; sin BD ni secretos.

// Tipos (PORT del módulo)
export type {
  AiRunner,
  TipoContrato,
  TipoProcedimiento,
  TipoSobre,
  TipoCriterio,
  CriterioValoracion,
  RequisitoSolvencia,
  DocumentoRequerido,
  Garantias,
  PlazosConcurso,
  FichaConcurso,
  ItemChecklist,
  PerfilEmpresa,
  Severidad,
  Semaforo,
  BanderaRoja,
  EvaluacionGoNoGo,
  TipoDocumentoBiblioteca,
  DocumentoBiblioteca,
  Biblioteca,
  DatosIdentificacionEmpresa,
  ItemSobreAdministrativo,
  Deuc,
  DeclaracionResponsable,
  SeccionMemoria,
  SeccionMemoriaRellena,
  MemoriaTecnica,
  CoberturaMemoria,
} from './types'

// Agente (orquesta el LLM por el puerto)
export { analizarPliego, analizarConcurso } from './agent'
export type { AnalisisConcurso } from './agent'

// Prompts (puros)
export { construirPromptPliego, MAX_PLIEGO_CHARS } from './prompts'

// Parsing (puro)
export { parseFichaConcurso, limpiarJSON } from './parsing'

// Checklist (puro)
export { derivarChecklist } from './checklist'

// Go / No-Go — banderas rojas (puro)
export { evaluarGoNoGo } from './redflags'

// Scoring (puro): garantías, baja temeraria, puntuación económica
export {
  round2,
  calcularGarantias,
  umbralBajaTemeraria,
  calcularPuntuacionEconomica,
  totalPuntos,
} from './scoring'
export type { GarantiasCalculadas, BajaTemeraria, FormulaEconomica } from './scoring'

// Biblioteca de empresa (puro): autocompletado del checklist + caducidades
export {
  tipoDeDocumento,
  autocompletarChecklist,
  documentosFaltantes,
  documentosCaducados,
} from './biblioteca'

// Sobre administrativo + DEUC (puro): sobre 1 + DEUC + declaración responsable
export {
  documentosSobreAdministrativo,
  construirDeuc,
  construirDeclaracionResponsable,
} from './deuc'

// Memoria técnica (puro): plan de secciones + prompt + cobertura de puntos
export {
  planificarMemoria,
  construirPromptMemoria,
  coberturaMemoria,
  MIN_CONTENIDO_CHARS,
} from './memoria'
