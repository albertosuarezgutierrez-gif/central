import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tgAlert, escapeHtml } from '@/lib/telegram'
import {
  fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements,
} from '@/lib/sivra/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

async function runSeoAnalysis(current: ReturnType<typeof extractSeoParams>) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `Eres un experto SEO para alojamientos turísticos en España.
Analiza la competencia para House Sevillana (www.housesevillana.es).
Propiedad: casa 290m2, 6 dormitorios, 4 banos, parking privado, patio andaluz, terraza, hasta 12 personas. Calle Socorro 24, Sevilla. VFT/SE/01179. Reserva directa sin comisiones OTA.
Keywords: "apartamento turistico Sevilla centro", "casa vacacional Sevilla grupos", "VFT Sevilla parking", "alquiler vacacional Sevilla 12 personas".
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}]}`,
      messages: [{
        role: 'user',
        content: `Title actual: ${current.title}\nDescription actual: ${current.description}\n\n1. Busca "apartamento turistico Sevilla centro 6 dormitorios"\n2. Busca "casa vacacional Sevilla grupos parking"\n3. Genera metadatos mejorados. Solo JSON.`,
      }],
    }),
  })
  const data = await res.json()
  const blocks = (data.content ?? []).filter((b: { type: string }) => b.type === 'text')
  const raw = (blocks[blocks.length - 1] as { text?: string })?.text ?? ''
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
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
