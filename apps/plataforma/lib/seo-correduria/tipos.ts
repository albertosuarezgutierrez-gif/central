// lib/seo-correduria/tipos.ts — contratos del cron SEO de la correduría.
//
// Cada fuente devuelve un TRI-ESTADO. `no_configurado` (falta el secreto) y `error` (el secreto
// está pero la llamada falló) NO se pintan nunca como «0 impresiones» ni como «no hay
// competidores»: es la regla «dato que NO hay ≠ dato que NO se ha mirado» de CLAUDE.md.
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md

export type Fuente = 'gsc' | 'posthog' | 'cobertura'
export type Estado = 'ok' | 'error' | 'no_configurado'

export type ResultadoFuente<T> =
  | { estado: 'ok'; datos: T }
  | { estado: 'error'; detalle: string }
  | { estado: 'no_configurado'; detalle: string } // detalle = qué secreto falta

export type FilaGsc = { clave: string; clics: number; impresiones: number; ctr: number; posicion: number }
/** 'YYYY-MM-DD', ambos inclusive. */
export type VentanaGsc = { desde: string; hasta: string }
/** `posicion` es null con 0 impresiones: no hay posición media de nada. */
export type TotalGsc = { clics: number; impresiones: number; ctr: number; posicion: number | null }
export type DatosGsc = {
  actual: { ventana: VentanaGsc; total: TotalGsc; consultas: FilaGsc[]; paginas: FilaGsc[] }
  /** null = no se pudo leer la semana anterior; NO es «cero». */
  anterior: { ventana: VentanaGsc; total: TotalGsc } | null
}

// ResultadoSerp/ConsultaSerp/DatosSerp — RETIRADO el cliente Serper que las llenaba (14/09/2026,
// decisión de Alberto: política «todo lo que pueda ir por OpenRouter, va por OpenRouter» +
// SERP-position-tracking innecesario en esta fase). Los tipos se QUEDAN porque
// `agente-decidir.ts` (agente autónomo de metadata de asegura-web) sigue tipado sobre
// `ConsultaSerp[]` — sin fuente que lo alimente, ese agente queda dormido (su kill switch
// `SEO_ASEGURA_AGENT_ENABLED` ya es default OFF y no hay evidencia de que se activara nunca).
export type ResultadoSerp = { posicion: number; dominio: string; url: string; titulo: string }
/** `propia` = posición de grupoasegura.es en el top-10; null = no está (que no es posición 0). */
export type ConsultaSerp = { consulta: string; pagina: string | null; top: ResultadoSerp[]; propia: number | null }
export type DatosSerp = { dominio: string; consultas: ConsultaSerp[] }

export type DatosPosthog = {
  dias: number
  visitantes: number
  paginasVistas: number
  topPaginas: { ruta: string; vistas: number }[]
  origenes: { dominio: string; sesiones: number }[]
}

/** Veredicto de la URL Inspection API. `DESCONOCIDO` = la API respondió un valor que no reconocemos. */
export type VerdictoCobertura = 'PASS' | 'PARTIAL' | 'FAIL' | 'NEUTRAL' | 'DESCONOCIDO'

/** Una URL inspeccionada. `estado:'error'` es «no se pudo comprobar ESTA página» — no tumba el lote. */
export type FilaCobertura = {
  url: string
  estado: 'ok' | 'error'
  detalle?: string
  verdicto?: VerdictoCobertura
  cobertura?: string | null
  indexacion?: string | null
  robotsTxt?: string | null
  rastreoPagina?: string | null
  ultimoRastreo?: string | null
  canonicalGoogle?: string | null
  canonicalUsuario?: string | null
}

export type DatosCobertura = { paginas: FilaCobertura[] }

export type Resultados = {
  gsc: ResultadoFuente<DatosGsc>
  posthog: ResultadoFuente<DatosPosthog>
  cobertura: ResultadoFuente<DatosCobertura>
}

export type Accion = {
  tipo: 'arreglar_fuente' | 'arreglar_indexacion' | 'mejorar_pagina' | 'escribir_pagina' | 'enlazado_interno'
  texto: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export const DOMINIO_PROPIO = 'grupoasegura.es'
export const PROPIEDAD_GSC = 'sc-domain:grupoasegura.es'
export const POSTHOG_PROJECT_ID_DEFECTO = '266897'
export const POSTHOG_API_HOST_DEFECTO = 'https://eu.posthog.com'
