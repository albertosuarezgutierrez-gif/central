import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { aiComplete } from '@/lib/ai-client'
import { escapeHtml, tgAvisoAlerta } from '@/lib/telegram'
import {
  fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements,
} from '@/lib/sivra/seo-landing'
import { buscarWeb } from '@/lib/websearch'

export const runtime = 'nodejs'
export const maxDuration = 60

// Análisis SEO con búsqueda de competencia en vivo. Orden de preferencia:
//   1) `buscarWeb` (lib/websearch.ts): Gemini grounding gratis si hay key con cuota
//      (GEMINI_WEBSEARCH=1) → plugin web de OpenRouter (~0,02€/búsqueda, presupuesto diario).
//   2) NIM/Groq texto puro SIN búsqueda → último recurso, el SEO sale de los datos del piso, no rompe.
// Histórico: empezó en Anthropic (key retirada → JSON.parse('') petaba), pasó a Gemini (429 de
// cuota), luego a Serper — RETIRADO el 24/08/2026: la cuenta agotó créditos el 22/08 y para este
// volumen (semanal, 4 búsquedas) el plugin de OpenRouter son céntimos al mes. Decisión de Alberto.
const SEO_SYSTEM = `Eres un experto SEO para alojamientos turísticos en España.
Analiza la competencia para House Sevillana (www.housesevillana.es).
Propiedad: casa 290m2, 6 dormitorios, 4 banos, parking privado, patio andaluz, terraza, hasta 12 personas. Calle Socorro 24, Sevilla. VFT/SE/01179. Reserva directa sin comisiones OTA.
Keywords: "apartamento turistico Sevilla centro", "casa vacacional Sevilla grupos", "VFT Sevilla parking", "alquiler vacacional Sevilla 12 personas".
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}]}`

/** Limpia fences markdown y extrae el primer objeto JSON. null si no hay JSON válido. */
function parseSeoJson(raw: string): Record<string, unknown> | null {
  const clean = (raw ?? '').replace(/```json|```/g, '').trim()
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  try { return JSON.parse(clean.slice(s, e + 1)) } catch { return null }
}

async function runSeoAnalysis(current: ReturnType<typeof extractSeoParams>) {
  const user = `Title actual: ${current.title}\nDescription actual: ${current.description}\n\n1. Busca "apartamento turistico Sevilla centro 6 dormitorios"\n2. Busca "casa vacacional Sevilla grupos parking"\n3. Genera metadatos mejorados. Solo JSON.`

  // 1) Búsqueda web con síntesis vía `buscarWeb` (Gemini grounding gratis si hay key → plugin web
  //    de OpenRouter, céntimos). Registra en ai_usos (endpoint 'seo').
  try {
    const res = await buscarWeb(SEO_SYSTEM, user, { app: 'sivra', endpoint: 'seo', maxTokens: 1500, timeoutMs: 45_000 })
    const parsed = parseSeoJson(res.text)
    if (parsed) return parsed
  } catch (e) {
    console.warn('[sivra/seo-refresh] búsqueda web no disponible:', String(e).slice(0, 150))
  }

  // 3) ÚLTIMO RECURSO: NIM/Groq texto puro, SIN búsqueda (gratis). SEO desde los datos de la propiedad.
  const parsed = parseSeoJson(await aiComplete([
    { role: 'system', content: SEO_SYSTEM },
    { role: 'user', content: user },
  ]))
  if (!parsed) throw new Error('El análisis SEO no devolvió JSON válido (Serper, Gemini y NIM agotados).')
  return parsed
}

export async function GET(req: Request) {
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const { content, sha } = await fetchLanding()
    const current  = extractSeoParams(content)
    const proposal = await runSeoAnalysis(current)
    const updated  = applySeoReplacements(content,
      String(proposal.title ?? ''),
      String(proposal.description ?? ''),
      String(proposal.og_description ?? ''),
    )
    await pushToGitHub(updated, sha, `chore(seo): actualización automática [${new Date().toISOString().split('T')[0]}]`)
    // La tabla real seo_proposals (BD compartida) NO tiene columna "updatedAt"; sí tiene
    // "createdAt" (default CURRENT_TIMESTAMP) y "appliedAt". El id es TEXT (de ahí ::text) y
    // "topCompetitors" es jsonb (el parámetro de Prisma llega como text → cast ::jsonb).
    // Verificado contra information_schema + INSERT en transacción revertida (26/06/2026).
    await prisma.$executeRaw`
      INSERT INTO seo_proposals (
        id, title, description, "ogDescription", "schemaDescription",
        "topCompetitors", analysis, "currentTitle", "currentDescription",
        token, status, "appliedAt", "createdAt"
      ) VALUES (
        gen_random_uuid()::text,
        ${String(proposal.title ?? '')},
        ${String(proposal.description ?? '')},
        ${String(proposal.og_description ?? '')},
        NULL,
        ${JSON.stringify(proposal.top_competitors ?? [])}::jsonb,
        ${String(proposal.analysis ?? '')},
        ${current.title},
        ${current.description},
        ${crypto.randomUUID()},
        'APPLIED',
        NOW(), NOW()
      )
    `
    return NextResponse.json({ ok: true, title: proposal.title, analysis: proposal.analysis })
  } catch (err) {
    console.error('[sivra/seo-refresh]', err)
    // Visibilidad: el cron automático ya no falla en silencio — avisa por el bot del monorepo.
    await tgAvisoAlerta('sistema.seo-landing', 
      `❌ Agente SEO (housesevillana) falló ${cronOk ? '[cron automático]' : '[manual]'}:\n<code>${escapeHtml(String(err))}</code>`,
      'critico',
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
