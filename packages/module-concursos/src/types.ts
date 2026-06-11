// ────────────────────────────────────────────────────────────────────────────
// PORT — Contrato del módulo de Concursos Públicos.
//
// El módulo es PURO: no conoce ninguna BD, ningún proveedor de IA ni secretos.
// · El LLM entra por el puerto `AiRunner` (la app lo respalda con core-ai).
// · La app normaliza el texto del pliego (extrae el PDF) antes de llamar.
// · La app persiste la `FichaConcurso` y el `Checklist` en su propia BD,
//   scopeados por su `empresa_id`.
//
// Vocabulario LCSP (Ley 9/2017 de Contratos del Sector Público).
// ────────────────────────────────────────────────────────────────────────────

/** Puerto del LLM: la app inyecta una función que llama a su proveedor (core-ai). */
export type AiRunner = (system: string, user: string) => Promise<string>

export type TipoContrato =
  | 'servicios'
  | 'suministros'
  | 'obras'
  | 'concesion_servicios'
  | 'concesion_obras'
  | 'mixto'
  | 'otro'

export type TipoProcedimiento =
  | 'abierto'
  | 'abierto_simplificado'
  | 'simplificado_sumario' // abreviado / "super simplificado"
  | 'restringido'
  | 'negociado'
  | 'dialogo_competitivo'
  | 'otro'

/** Los tres sobres clásicos de una licitación. */
export type TipoSobre = 'administrativo' | 'tecnico' | 'economico'

/** Cómo se valora un criterio de adjudicación. */
export type TipoCriterio = 'automatico' | 'juicio_valor'

// ────────────────────────────────────────────────────────────────────────────
// Piezas de la ficha
// ────────────────────────────────────────────────────────────────────────────

/** Un criterio de adjudicación con su peso. */
export interface CriterioValoracion {
  nombre: string
  puntos: number            // peso máximo en puntos
  tipo: TipoCriterio        // automático (fórmula) o juicio de valor (subjetivo)
  sobre?: TipoSobre         // dónde se evalúa (técnico vs económico)
  formula?: string          // descripción de la fórmula si es automático (ej. precio)
}

/** Un requisito de solvencia exigido al licitador. */
export interface RequisitoSolvencia {
  ambito: 'economica' | 'tecnica'
  descripcion: string
  // Umbral cuantificable si el pliego lo da (ej. volumen de negocio mínimo)
  importe_minimo?: number
}

/** Un documento que hay que aportar, asignado a su sobre. */
export interface DocumentoRequerido {
  nombre: string
  sobre: TipoSobre
  obligatorio: boolean
  // Modelo/anexo del propio pliego a rellenar, si lo indica (ej. "Anexo II").
  modelo?: string
}

/** Garantías exigidas (provisional/definitiva). */
export interface Garantias {
  provisional_pct?: number  // % sobre presupuesto base (0–100); normalmente 0
  definitiva_pct?: number   // % sobre importe de adjudicación (normalmente 5)
  complementaria_pct?: number
}

/** Fechas e hitos del expediente (ISO 8601 'YYYY-MM-DD' cuando se conozcan). */
export interface PlazosConcurso {
  publicacion?: string
  fin_presentacion?: string  // fin de plazo de presentación de ofertas
  fin_aclaraciones?: string  // fin del periodo de consultas/aclaraciones
  ejecucion_meses?: number   // plazo de ejecución del contrato
}

// ────────────────────────────────────────────────────────────────────────────
// Ficha del concurso — salida principal de `analizarPliego`
// ────────────────────────────────────────────────────────────────────────────

export interface FichaConcurso {
  // Identificación
  objeto: string                         // objeto del contrato
  organo_contratacion?: string           // entidad convocante
  expediente?: string                    // nº de expediente
  cpv?: string[]                         // códigos CPV
  tipo_contrato: TipoContrato
  procedimiento: TipoProcedimiento

  // Importes (en euros, sin IVA salvo que se indique)
  presupuesto_base?: number              // presupuesto base de licitación
  valor_estimado?: number                // valor estimado del contrato (VEC)
  lotes: number                          // 0/1 = sin lotes; >1 = nº de lotes

  // Plazos, solvencia, garantías, criterios y documentación
  plazos: PlazosConcurso
  solvencia: RequisitoSolvencia[]
  garantias: Garantias
  criterios: CriterioValoracion[]
  documentos: DocumentoRequerido[]

  // Trazas para auditar la extracción
  avisos?: string[]                      // dudas/ambigüedades detectadas por el agente
}

// ────────────────────────────────────────────────────────────────────────────
// Checklist derivado (puro) de la ficha
// ────────────────────────────────────────────────────────────────────────────

export interface ItemChecklist {
  sobre: TipoSobre
  documento: string
  obligatorio: boolean
  modelo?: string
  hecho: boolean        // la app lo marca; el módulo lo inicializa a false
}

// ────────────────────────────────────────────────────────────────────────────
// Go / No-Go (banderas rojas) — necesita el perfil de la empresa licitadora
// ────────────────────────────────────────────────────────────────────────────

/** Datos mínimos de la empresa para decidir si puede presentarse. */
export interface PerfilEmpresa {
  // Solvencia económica que la empresa puede acreditar
  volumen_negocio_anual?: number
  // Capacidad operativa para asumir el plazo de ejecución
  meses_disponibilidad?: number
  // ¿Puede constituir las garantías exigidas? (avales)
  puede_avalar?: boolean
}

export type Severidad = 'bloqueante' | 'aviso'
export type Semaforo = 'verde' | 'ambar' | 'rojo'

export interface BanderaRoja {
  severidad: Severidad
  motivo: string
}

export interface EvaluacionGoNoGo {
  semaforo: Semaforo            // rojo = no apto; ámbar = revisar; verde = adelante
  banderas: BanderaRoja[]
  recomendacion: string
}

// ────────────────────────────────────────────────────────────────────────────
// Biblioteca de empresa (F2) — documentos/datos reutilizables del licitador.
// Es lo que permite autocompletar el checklist de cada concurso.
// ────────────────────────────────────────────────────────────────────────────

/** Familia de documento del licitador (la app guarda el fichero aparte). */
export type TipoDocumentoBiblioteca =
  | 'escritura_constitucion'
  | 'poderes'
  | 'cif'
  | 'certificado_aeat'          // estar al corriente con Hacienda
  | 'certificado_ss'            // estar al corriente con la Seguridad Social
  | 'cuentas_anuales'
  | 'seguro_rc'                 // responsabilidad civil
  | 'clasificacion_empresarial'
  | 'certificado_iso'
  | 'declaracion_responsable'
  | 'deuc'
  | 'otro'

/** Un documento guardado en la biblioteca de la empresa. */
export interface DocumentoBiblioteca {
  tipo: TipoDocumentoBiblioteca
  nombre: string
  vigencia_hasta?: string                 // ISO 'YYYY-MM-DD' si caduca
  datos?: Record<string, unknown>         // metadatos (p.ej. nº de póliza)
}

export type Biblioteca = DocumentoBiblioteca[]
