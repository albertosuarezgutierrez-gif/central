import { NextResponse } from 'next/server'
import { geminiSearch } from '@central/core-ai'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tgAlert, escapeHtml } from '@/lib/telegram'
import {
  fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements,
} from '@/lib/sivra/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

// Análisis SEO vía la pasarela de IA del propio monorepo (Gemini + Google Search por debajo).
// Antes llamaba a Anthropic directo (ANTHROPIC_API_KEY), pero el monorepo migró de Anthropic a la
// pasarela: esa key ya no está en plataforma → la respuesta venía vacía y `JSON.parse('')` reventaba.
// Plataforma ES la pasarela, así que llamamos a geminiSearch directamente (sin HTTP a sí misma).
const SEO_SYSTEM = `Eres un experto SEO para alojamientos turísticos en España.
Analiza la competencia para House Sevillana (www.housesevillana.es).
Propiedad: casa 290m2, 6 dormitorios, 4 banos, parking privado, patio andaluz, terraza, hasta 12 personas. Calle Socorro 24, Sevilla. VFT/SE/01179. Reserva directa sin comisiones OTA.
Keywords: "apartamento turistico Sevilla centro", "casa vacacional Sevilla grupos", "VFT Sevilla parking", "alquiler vacacional Sevilla 12 personas".
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}]}`

async function runSeoAnalysis(current: ReturnType<typeof extractSeoParams>) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('Falta GEMINI_API_KEY en plataforma (necesaria para el análisis SEO de housesevillana vía la pasarela de IA).')
  const user = `Title actual: ${current.title}\nDescription actual: ${current.description}\n\n1. Busca "apartamento turistico Sevilla centro 6 dormitorios"\n2. Busca "casa vacacional Sevilla grupos parking"\n3. Genera metadatos mejorados. Solo JSON.`
  const raw = await geminiSearch({ apiKey: key }, SEO_SYSTEM, user, { maxTokens: 1500, timeoutMs: 45_000 })
  const clean = (raw ?? '').replace(/```json|```/g, '').trim()
  if (!clean) throw new Error('El análisis SEO (Gemini) devolvió una respuesta vacía.')
  try {
    return JSON.parse(clean)
  } catch {
    throw new Error(`El análisis SEO devolvió algo que no es JSON válido: ${clean.slice(0, 200)}`)
  }
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
    await prisma.$executeRaw`
      INSERT INTO seo_proposals (
        id, title, description, "ogDescription", "schemaDescription",
        "topCompetitors", analysis, "currentTitle", "currentDescription",
        token, status, "appliedAt", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${String(proposal.title ?? '')},
        ${String(proposal.description ?? '')},
        ${String(proposal.og_description ?? '')},
        NULL,
        ${JSON.stringify(proposal.top_competitors ?? [])},
        ${String(proposal.analysis ?? '')},
        ${current.title},
        ${current.description},
        ${crypto.randomUUID()},
        'APPLIED',
        NOW(), NOW(), NOW()
      )
    `
    return NextResponse.json({ ok: true, title: proposal.title, analysis: proposal.analysis })
  } catch (err) {
    console.error('[sivra/seo-refresh]', err)
    // Visibilidad: el cron automático ya no falla en silencio — avisa por el bot del monorepo.
    await tgAlert(
      `❌ Agente SEO (housesevillana) falló ${cronOk ? '[cron automático]' : '[manual]'}:\n<code>${escapeHtml(String(err))}</code>`,
      'critico',
    )
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
