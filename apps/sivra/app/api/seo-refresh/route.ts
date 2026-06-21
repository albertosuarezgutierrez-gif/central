import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { aiSearch } from '@/lib/ai-client'
import { fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements } from '@/lib/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

// Análisis SEO vía pasarela central (Gemini + Google Search por debajo) — antes Anthropic web_search.
const SEO_SYSTEM = `Eres un experto SEO para alojamientos turísticos en España.
Analiza la competencia para House Sevillana (www.housesevillana.es).
Propiedad: casa 290m2, 6 dormitorios, 4 banos, parking privado, patio andaluz, terraza, hasta 12 personas. Calle Socorro 24, Sevilla. VFT/SE/01179. Reserva directa sin comisiones OTA.
Keywords: "apartamento turistico Sevilla centro", "casa vacacional Sevilla grupos", "VFT Sevilla parking", "alquiler vacacional Sevilla 12 personas".
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}],"schema":{"@context":"https://schema.org","@type":"VacationRental","name":"House Sevillana","description":"(1-2 frases)"}}`

async function runSeoAnalysis(current: ReturnType<typeof extractSeoParams>) {
  const user = `Title actual: ${current.title}\nDescription actual: ${current.description}\n\n1. Busca "apartamento turistico Sevilla centro 6 dormitorios"\n2. Busca "casa vacacional Sevilla grupos parking"\n3. Genera metadatos mejorados. Solo JSON.`
  const raw = await aiSearch(SEO_SYSTEM, user, { maxTokens: 4000, timeoutMs: 50_000 })
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

export async function GET(req: Request) {
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  // Kill switch: el cron automático solo actúa si SEO_AGENT_ENABLED === 'true'.
  // El botón manual (con sesión) funciona siempre — es una acción humana deliberada.
  if (cronOk && process.env.SEO_AGENT_ENABLED !== 'true') {
    return NextResponse.json({ ok: false, msg: 'SEO_AGENT_ENABLED != true (agente automático deshabilitado)' })
  }
  if (!cronOk) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { content, sha } = await fetchLanding()
    const current = extractSeoParams(content)
    const proposal = await runSeoAnalysis(current)
    const schemaJson = proposal.schema ? JSON.stringify(proposal.schema) : undefined
    const updated = applySeoReplacements(content,
      String(proposal.title ?? ''),
      String(proposal.description ?? ''),
      String(proposal.og_description ?? ''),
      schemaJson,
    )
    await pushToGitHub(updated, sha, `chore(seo): actualización automática [${new Date().toISOString().split('T')[0]}]`)
    await prisma.seoProposal.create({
      data: {
        title: String(proposal.title ?? ''),
        description: String(proposal.description ?? ''),
        ogDescription: String(proposal.og_description ?? ''),
        schemaDescription: schemaJson ?? null,
        topCompetitors: proposal.top_competitors ?? null,
        analysis: String(proposal.analysis ?? ''),
        currentTitle: current.title,
        currentDescription: current.description,
        currentOgDescription: current.ogDescription,
        token: crypto.randomUUID(),
        status: 'APPLIED',
        appliedAt: new Date(),
      },
    })
    return NextResponse.json({ ok: true, title: proposal.title, analysis: proposal.analysis })
  } catch (err) {
    console.error('[seo-refresh]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
