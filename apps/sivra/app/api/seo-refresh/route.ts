import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!

async function fetchLanding() {
  const res = await fetch(
    'https://api.github.com/repos/albertosuarezgutierrez-gif/house-sevillana-landing/contents/app/route.ts',
    { headers: { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'roi-intranet-seo' } }
  )
  const d = await res.json()
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha as string }
}

async function pushToGitHub(content: string, sha: string) {
  const res = await fetch(
    'https://api.github.com/repos/albertosuarezgutierrez-gif/house-sevillana-landing/contents/app/route.ts',
    {
      method: 'PUT',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'roi-intranet-seo' },
      body: JSON.stringify({
        message: `chore(seo): actualización automática [${new Date().toISOString().split('T')[0]}]`,
        content: Buffer.from(content).toString('base64'),
        sha,
      }),
    }
  )
  if (!res.ok) throw new Error(`GitHub push failed: ${await res.text()}`)
}

function extractSeoParams(raw: string) {
  return {
    title:         raw.match(/<title>([^<]+)<\/title>/)?.[1]                                    ?? '',
    description:   raw.match(/<meta name=\\"description\\" content=\\"([^\\"]+)\\"/)?.[1]       ?? '',
    ogDescription: raw.match(/<meta property=\\"og:description\\" content=\\"([^\\"]+)\\"/)?.[1] ?? '',
  }
}

function escJs(s: string) { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }

function applySeoReplacements(raw: string, title: string, description: string, ogDescription: string) {
  return raw
    .replace(/<title>[^<]*<\/title>/,
      `<title>${title}<\/title>`)
    .replace(/<meta name=\\"description\\" content=\\"[^\\"]*\\"/,
      `<meta name=\\"description\\" content=\\"${escJs(description)}\\"`)
    .replace(/<meta property=\\"og:title\\" content=\\"[^\\"]*\\"/,
      `<meta property=\\"og:title\\" content=\\"${escJs(title)}\\"`)
    .replace(/<meta property=\\"og:description\\" content=\\"[^\\"]*\\"/,
      `<meta property=\\"og:description\\" content=\\"${escJs(ogDescription)}\\"`)
}

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
  const blocks = (data.content ?? []).filter((b: {type: string}) => b.type === 'text')
  const raw = (blocks[blocks.length - 1] as {text?: string})?.text ?? ''
  return JSON.parse(raw.replace(/```json|```/g, '').trim())
}

export async function GET(req: Request) {
  const cronOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { content, sha } = await fetchLanding()
    const current = extractSeoParams(content)
    const proposal = await runSeoAnalysis(current)
    const updated = applySeoReplacements(content,
      String(proposal.title ?? ''),
      String(proposal.description ?? ''),
      String(proposal.og_description ?? ''),
    )
    await pushToGitHub(updated, sha)
    await prisma.seoProposal.create({
      data: {
        title: String(proposal.title ?? ''),
        description: String(proposal.description ?? ''),
        ogDescription: String(proposal.og_description ?? ''),
        schemaDescription: null,
        topCompetitors: proposal.top_competitors ?? null,
        analysis: String(proposal.analysis ?? ''),
        currentTitle: current.title,
        currentDescription: current.description,
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
