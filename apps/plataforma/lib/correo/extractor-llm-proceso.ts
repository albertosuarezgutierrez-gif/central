// lib/correo/extractor-llm-proceso.ts — Las dependencias REALES del extractor LLM en sombra (F2, 21/10/2026).
//
// Proveedor: la cadena de `@central/core-ai` por OpenRouter (decisión de Alberto, 21/10/2026), con el modelo de MEJOR
// calidad de extracción del catálogo (`anthropic/claude-sonnet-4.5`, el que ya usa el lector registral) salvo
// `CORREO_LLM_MODELO`. Privacidad como el asistente de la correduría: `data_collection:'deny'` + `zdr:true`, SIN caída a
// la cadena gratis (Groq/NIM): si falla, no se lee y se dice. Presupuesto diario en € de la pasarela
// (`dentroDePresupuestoDiario`) + registro en `ai_usos` (app `correo-extractor`), que es también el contador del tope diario.

import { openrouterChatEx } from '@central/core-ai'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { costePorUso, dentroDePresupuestoDiario, PROVEEDOR_PASARELA, registrarUso } from '@/lib/ai-gateway'
import { getDirectorEstado, openrouterConfigPasarela } from '@/lib/ia-director'
import { modeloOpenRouterValido } from '@/lib/modelo-openrouter'
import { registrarLecturaLLMAsegura } from '@/lib/correduria-puerto'
import { APP_EXTRACTOR, ENDPOINT_EXTRACTOR, type DepsExtractor } from './extractor-llm'

export const MODELO_EXTRACTOR_DEFECTO = 'anthropic/claude-sonnet-4.5'
const TIMEOUT_MS = 20_000
const MAX_TOKENS = 700

/** Modelo del extractor: `CORREO_LLM_MODELO` si es un slug válido de OpenRouter; si no, el por defecto. */
export function modeloExtractor(): string {
  return modeloOpenRouterValido(process.env.CORREO_LLM_MODELO) ?? MODELO_EXTRACTOR_DEFECTO
}

async function llamar(system: string, user: string): Promise<{ texto: string; modelo: string }> {
  const or = openrouterConfigPasarela()
  const modelo = modeloExtractor()
  if (!or) throw new Error('extractor: sin OPENROUTER_API_KEY (no se cae a Groq/NIM)')
  const presupuesto = await dentroDePresupuestoDiario(APP_EXTRACTOR)
  if (!presupuesto.ok) {
    await registrarUso({ app: APP_EXTRACTOR, endpoint: ENDPOINT_EXTRACTOR, proveedor: PROVEEDOR_PASARELA, modelo, ok: false, ms: 0, error: presupuesto.motivo ?? 'presupuesto' })
    throw new Error(presupuesto.motivo ?? 'presupuesto diario excedido')
  }
  const t0 = Date.now()
  try {
    const r = await openrouterChatEx(or, [{ role: 'user', content: user }], {
      system, models: [modelo], maxTokens: MAX_TOKENS, temperature: 0,
      privacidad: true, provider: { zdr: true }, signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const coste = typeof r.usage?.cost === 'number' && Number.isFinite(r.usage.cost)
      ? +(r.usage.cost * Number(process.env.AI_USD_EUR ?? 0.9)).toFixed(6)
      : costePorUso(r.model, r.usage, (await getDirectorEstado().catch(() => null))?.modelos ?? [])
    await registrarUso({ app: APP_EXTRACTOR, endpoint: ENDPOINT_EXTRACTOR, proveedor: PROVEEDOR_PASARELA, modelo: r.model, ok: true, ms: Date.now() - t0, tokens: r.usage?.total_tokens ?? 0, costeEur: coste })
    return { texto: r.text, modelo: r.model }
  } catch (e) {
    await registrarUso({ app: APP_EXTRACTOR, endpoint: ENDPOINT_EXTRACTOR, proveedor: PROVEEDOR_PASARELA, modelo, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : 'fallo' })
    throw e
  }
}

/** Llamadas del extractor HOY (día UTC, como el presupuesto diario de la pasarela), fallidas incluidas. `null` = no se pudo leer. */
async function usadasHoy(): Promise<number | null> {
  try {
    const r = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
      SELECT count(*) AS n FROM ai_usos
      WHERE app = ${APP_EXTRACTOR} AND endpoint = ${ENDPOINT_EXTRACTOR} AND creada_at >= date_trunc('day', now())`)
    return Number(r[0]?.n ?? 0)
  } catch {
    return null
  }
}

async function guardar(lectura: Record<string, unknown>): Promise<boolean> {
  const r = await registrarLecturaLLMAsegura(lectura)
  if (r.estado !== 'ok') console.error('[triaje/extractor] lectura LLM no guardada:', r.motivo)
  return r.estado === 'ok'
}

export function depsExtractorReales(textoAdjuntos: () => Promise<string | null>): DepsExtractor {
  return { llamar, usadasHoy, guardar, textoAdjuntos }
}
