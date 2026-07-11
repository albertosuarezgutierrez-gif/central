// Agente DIRECTOR — router de modelos de la pasarela /api/ai/* sobre OpenRouter.
// Un modelo barato y rápido lee la petición y elige el slug ideal del CATÁLOGO (allowlist
// versionada en ia_director_prompt, regenerada cada semana por /api/cron/ia-director-refresh).
// Salida ESTRUCTURADA (json_schema con enum de slugs) → no puede inventar un modelo.
// Modo SOMBRA (default): decide y se registra en ai_usos, pero se sirve con el modelo por
// defecto; DIRECTOR_MODO=activo enruta de verdad. Cualquier fallo → modelos por defecto.

import { prisma } from '@/lib/db'
import { openrouterChatEx, cleanJSON, type NimChatMessage, type OpenRouterConfig } from '@central/core-ai'
import { registrarUso, ratioPresupuestoDiario, estimarTokens } from '@/lib/ai-gateway'
import { modelosPermitidos, type CatalogoModelo } from '@/lib/director-modelos'

export type { CatalogoModelo } from '@/lib/director-modelos'

export type DirectorEstado = {
  version: number
  prompt: string
  modelos: CatalogoModelo[]
  suplentes: string[]
}

// Defaults conservadores si la BD no responde o la tabla está vacía (mismos que la semilla SQL).
const MODELO_DEFAULT = 'deepseek/deepseek-chat'
const SUPLENTES_DEFAULT = ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.5-flash']

/** Config OpenRouter de la PASARELA desde el entorno (null si no hay key → camino clásico). */
export function openrouterConfigPasarela(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  return {
    apiKey,
    textModel: process.env.OPENROUTER_MODEL || MODELO_DEFAULT,
    baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
    referer: process.env.OPENROUTER_REFERER || 'https://plataforma-ten-flame.vercel.app',
    title: process.env.OPENROUTER_TITLE || 'central',
  }
}

export function modelosPorDefecto(): { model: string; fallbacks: string[] } {
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODELS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return {
    model: process.env.OPENROUTER_MODEL || MODELO_DEFAULT,
    fallbacks: fallbacks.length ? fallbacks : SUPLENTES_DEFAULT,
  }
}

// Caché en memoria del estado del Director (la lambda lo reutiliza entre invocaciones calientes).
let cacheEstado: { estado: DirectorEstado; at: number } | null = null
const TTL_MS = 5 * 60_000

/** Última versión de prompt+catálogo desde BD (con caché 5 min). null si no hay fila o falla. */
export async function getDirectorEstado(): Promise<DirectorEstado | null> {
  if (cacheEstado && Date.now() - cacheEstado.at < TTL_MS) return cacheEstado.estado
  try {
    const rows = await prisma.$queryRaw<Array<{ version: number; prompt: string; catalogo: unknown }>>`
      SELECT version, prompt, catalogo FROM ia_director_prompt ORDER BY version DESC LIMIT 1`
    if (!rows.length) return null
    const cat = (rows[0].catalogo ?? {}) as { modelos?: CatalogoModelo[]; suplentes?: string[] }
    const estado: DirectorEstado = {
      version: rows[0].version,
      prompt: rows[0].prompt,
      modelos: Array.isArray(cat.modelos) ? cat.modelos : [],
      suplentes: Array.isArray(cat.suplentes) ? cat.suplentes : SUPLENTES_DEFAULT,
    }
    cacheEstado = { estado, at: Date.now() }
    return estado
  } catch { return null }
}

export type Eleccion = {
  /** Modelo con el que SE SIRVE la petición (en sombra, el default). */
  model: string
  fallbacks: string[]
  /** Lo que decidió el Director (null si no llegó a decidir). */
  decidido: string | null
  modo: 'activo' | 'sombra' | 'default'
  /** Catálogo para calcular coste real (costePorUso). */
  modelos: CatalogoModelo[]
}

// Resume la conversación para el Director: el último mensaje de usuario (recortado) manda.
function resumenEntrada(messages: NimChatMessage[], system?: string): string {
  const ultimo = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const partes = [
    system ? `[contexto del sistema] ${String(system).slice(0, 300)}` : '',
    `[petición] ${String(ultimo).slice(0, 900)}`,
  ].filter(Boolean)
  return partes.join('\n')
}

/**
 * Elige el modelo OpenRouter para una petición de la pasarela. NUNCA lanza: cualquier fallo
 * (sin key, BD caída, Director mudo, slug fuera del catálogo) degrada a los modelos por defecto.
 */
export async function elegirModelo(
  messages: NimChatMessage[],
  opts: { system?: string; app?: string; clienteRef?: string | null; eu?: boolean } = {},
): Promise<Eleccion> {
  const porDefecto = modelosPorDefecto()
  const config = openrouterConfigPasarela()
  const estado = await getDirectorEstado()
  if (!config || !estado || !estado.modelos.length) {
    return { ...porDefecto, decidido: null, modo: 'default', modelos: estado?.modelos ?? [] }
  }
  // El catálogo que el Director puede elegir se estrecha ANTES de decidir, según señales de la
  // petición (código determinista, no el LLM): presupuesto del día (degradación gradual a modelos
  // baratos), tamaño real de la petición (contexto suficiente) y RGPD (solo UE si es sensible).
  const ratio = await ratioPresupuestoDiario(opts.app ?? 'pasarela', opts.clienteRef ?? null).catch(() => 0)
  const contextoMin = estimarTokens(opts.system, ...messages.map(m => m.content))
  const permitidos = modelosPermitidos(estado.modelos, {
    ratioPresupuesto: ratio,
    umbral: Number(process.env.DIRECTOR_PRESUPUESTO_UMBRAL ?? 0.8),
    precioOutMax: Number(process.env.DIRECTOR_PRESUPUESTO_PRECIO_OUT ?? 1.0),
    contextoMin,
    soloEu: opts.eu === true,
  })
  const slugs = permitidos.map(m => m.id)
  const activo = process.env.DIRECTOR_MODO === 'activo'

  let decidido: string | null = null
  const t0 = Date.now()
  try {
    const res = await openrouterChatEx(
      config,
      [{ role: 'user', content: resumenEntrada(messages, opts.system) }],
      {
        system: estado.prompt,
        models: [process.env.DIRECTOR_MODEL || MODELO_DEFAULT],
        maxTokens: 60,
        temperature: 0,
        signal: AbortSignal.timeout(4_000),
        responseFormat: {
          type: 'json_schema',
          json_schema: {
            name: 'eleccion_modelo',
            strict: true,
            schema: {
              type: 'object',
              properties: { modelo: { type: 'string', enum: slugs } },
              required: ['modelo'],
              additionalProperties: false,
            },
          },
        },
      },
    )
    // Algunos modelos envuelven el JSON en fences de markdown (```json ... ```) pese al
    // response_format:json_schema pedido — OpenRouter no lo fuerza a nivel de proveedor.
    const parsed = JSON.parse(cleanJSON(res.text)) as { modelo?: string }
    // Cinturón y tirantes: el enum ya lo garantiza, pero jamás ejecutar un slug fuera del catálogo.
    if (parsed.modelo && slugs.includes(parsed.modelo)) decidido = parsed.modelo
    await registrarUso({
      app: opts.app ?? 'pasarela', endpoint: 'director', proveedor: 'openrouter',
      modelo: decidido, ok: !!decidido, ms: Date.now() - t0,
      tokens: res.usage?.total_tokens ?? 0, clienteRef: opts.clienteRef ?? null,
      error: decidido ? null : 'slug fuera de catálogo',
    })
  } catch (e) {
    await registrarUso({
      app: opts.app ?? 'pasarela', endpoint: 'director', proveedor: 'openrouter',
      modelo: null, ok: false, ms: Date.now() - t0, clienteRef: opts.clienteRef ?? null,
      error: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'error',
    })
  }

  if (!decidido) return { ...porDefecto, decidido: null, modo: 'default', modelos: estado.modelos }

  // :floor = proveedor más barato del modelo elegido (no aplica a variantes ya sufijadas).
  const usarFloor = process.env.DIRECTOR_USAR_FLOOR !== 'false'
  const servido = usarFloor && !decidido.includes(':') ? `${decidido}:floor` : decidido
  const suplentes = estado.suplentes.filter(s => s !== decidido && s !== servido)

  if (!activo) {
    // SOMBRA: la decisión ya quedó registrada arriba; se sirve con el default para comparar.
    return { ...porDefecto, decidido, modo: 'sombra', modelos: estado.modelos }
  }
  return { model: servido, fallbacks: suplentes, decidido, modo: 'activo', modelos: estado.modelos }
}
