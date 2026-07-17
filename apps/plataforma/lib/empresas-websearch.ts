// Capa de BÚSQUEDA WEB (gratis) del módulo Empresas: contexto público que complementa al BORME y al
// enriquecimiento de pago. Reutiliza lib/websearch.ts::buscarWeb (Gemini grounding gratis → plugin web
// de OpenRouter de pago, gateado por el presupuesto diario). La IA SOLO resume/cita lo que la búsqueda
// devuelve — nunca inventa — e incluye enlaces para que Alberto verifique.
import { buscarWeb, busquedaConfigurada } from '@/lib/websearch'

export interface ResultadoWeb {
  ok: boolean
  text: string
  proveedor?: 'gemini' | 'openrouter'
  error?: string
}

const OPTS = { app: 'plataforma', endpoint: 'empresas-web', maxTokens: 1200, timeoutMs: 40_000 }

async function ejecutar(system: string, user: string): Promise<ResultadoWeb> {
  if (!busquedaConfigurada()) {
    return { ok: false, text: '', error: 'Búsqueda web no configurada (falta GEMINI_API_KEY / OPENROUTER_API_KEY).' }
  }
  try {
    const r = await buscarWeb(system, user, OPTS)
    return { ok: true, text: r.text?.trim() || 'Sin resultados.', proveedor: r.proveedor }
  } catch (e) {
    return { ok: false, text: '', error: e instanceof Error ? e.message : 'La búsqueda no está disponible ahora mismo.' }
  }
}

const REGLA_CITAS = 'Resume SOLO lo que encuentres en la búsqueda; si no hay información fiable, dilo claramente. NUNCA inventes datos ni cifras. Incluye los ENLACES de las fuentes. Sé conciso (máx. ~8 líneas). Responde en español.'

/** Investiga una empresa concreta en la web: actividad, por qué está en dificultad, web, tamaño, relevo. */
export function investigarEmpresa(nombre: string, provincia?: string | null): Promise<ResultadoWeb> {
  const system = `Eres un analista que investiga empresas españolas pequeñas en dificultad financiera para una posible compra o asesoría. ${REGLA_CITAS}`
  const donde = provincia ? ` (provincia de ${provincia})` : ''
  const user = `Investiga la empresa española "${nombre}"${donde}. Quiero saber: a qué se dedica, su web oficial, tamaño aproximado (empleados/facturación si consta), por qué podría estar en concurso o disolución (noticias), y quién la dirige o si hay relevo generacional/venta. Incluye enlaces a las fuentes.`
  return ejecutar(system, user)
}

/** Analiza en la web la tendencia de un sector (crecimiento/decrecimiento) para el radar. */
export function analizarSectorWeb(sector: string): Promise<ResultadoWeb> {
  const system = `Eres un analista sectorial. ${REGLA_CITAS}`
  const user = `¿Cómo está el sector "${sector}" en España en 2025-2026: crece o decrece? Dame señales de actividad, facturación, nº de empresas, concursos o cierres, y contexto de mercado. Incluye enlaces a las fuentes.`
  return ejecutar(system, user)
}

/** Busca en la web para responder una pregunta libre del agente (contexto externo a la BD). */
export function buscarContextoAgente(pregunta: string): Promise<ResultadoWeb> {
  const system = `Eres un asistente que busca información pública en internet sobre empresas y sectores españoles. ${REGLA_CITAS}`
  return ejecutar(system, pregunta)
}
