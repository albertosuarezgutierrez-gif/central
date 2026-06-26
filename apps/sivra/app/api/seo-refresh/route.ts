import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { aiComplete, aiSearch } from '@/lib/ai-client'
import { tgAlert } from '@/lib/telegram'
import { fetchLanding, pushToGitHub, extractSeoParams, applySeoReplacements } from '@/lib/seo-landing'

export const runtime = 'nodejs'
export const maxDuration = 60

// Análisis SEO con búsqueda de competencia en vivo. Mismo patrón endurecido que la ruta del botón en
// plataforma (apps/plataforma/app/api/sivra/seo-refresh/route.ts). Orden de preferencia (todo GRATIS):
//   1) Serper (Google Search API, free ~2.500/mes) + NIM redacta  → competencia REAL, coste 0.
//   2) aiSearch (pasarela central → Gemini con grounding)         → en free tier su cuota da 429 a menudo.
//   3) NIM/Groq texto puro SIN búsqueda                           → último recurso, el SEO sale del piso, no rompe.
// Histórico: empezó en Anthropic web_search (key retirada → JSON.parse('') petaba), pasó a Gemini (429),
// y ahora Serper es la vía principal gratis. SERPER_API_KEY se pega desde /operador/secretos (plataforma).
const SEO_SYSTEM = `Eres un experto SEO para alojamientos turísticos en España.
Analiza la competencia para House Sevillana (www.housesevillana.es).
Propiedad: casa 290m2, 6 dormitorios, 4 banos, parking privado, patio andaluz, terraza, hasta 12 personas. Calle Socorro 24, Sevilla. VFT/SE/01179. Reserva directa sin comisiones OTA.
Keywords: "apartamento turistico Sevilla centro", "casa vacacional Sevilla grupos", "VFT Sevilla parking", "alquiler vacacional Sevilla 12 personas".
Responde SOLO con JSON valido sin markdown:
{"title":"(max 60 chars)","description":"(max 155 chars)","og_description":"(max 100 chars)","analysis":"150-200 palabras","top_competitors":[{"title":"","why_ranking":""}],"schema":{"@context":"https://schema.org","@type":"VacationRental","name":"House Sevillana","description":"(1-2 frases)"}}`

/** Búsqueda real en Google vía Serper. Devuelve "título | snippet" por línea (mismo patrón que mercado). */
async function serperSearch(key: string, query: string): Promise<string> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'es', hl: 'es', num: 10 }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Serper ${res.status}`)
  const data = await res.json()
  const organic: Array<{ title?: string; snippet?: string }> = data.organic || []
  return organic.slice(0, 8).map(r => `${r.title ?? ''} | ${r.snippet ?? ''}`).join('\n')
}

/** Limpia fences markdown y extrae el primer objeto JSON. null si no hay JSON válido. */
function parseSeoJson(raw: string): Record<string, unknown> | null {
  const clean = (raw ?? '').replace(/```json|```/g, '').trim()
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}')
  if (s === -1 || e <= s) return null
  try { return JSON.parse(clean.slice(s, e + 1)) } catch { return null }
}

async function runSeoAnalysis(current: ReturnType<typeof extractSeoParams>) {
  const user = `Title actual: ${current.title}\nDescription actual: ${current.description}\n\n1. Busca "apartamento turistico Sevilla centro 6 dormitorios"\n2. Busca "casa vacacional Sevilla grupos parking"\n3. Genera metadatos mejorados. Solo JSON.`

  // 1) PREFERIDO: búsqueda REAL en Google (Serper, gratis) + NIM redacta. Competencia en vivo, coste 0.
  const serperKey = process.env.SERPER_API_KEY
  if (serperKey) {
    try {
      const queries = [
        'apartamento turistico Sevilla centro 6 dormitorios precio',
        'casa vacacional Sevilla grupos parking 12 personas',
        'alquiler vacacional Sevilla centro grupos grandes precio noche',
        'VFT Sevilla casa completa parking patio andaluz',
      ]
      // .catch por consulta: una búsqueda que falle no tumba al resto.
      const resultados = await Promise.all(queries.map(q => serperSearch(serperKey, q).catch(() => '')))
      const contexto = resultados.filter(s => s && s.trim()).join('\n')
      if (contexto.trim()) {
        const raw = await aiComplete(
          [{ role: 'user', content: `${user}\n\nResultados REALES de Google sobre la competencia (úsalos para title/description y para top_competitors). Lista 4-6 competidores REALES extraídos de estos resultados, no inventes:\n${contexto}` }],
          { system: SEO_SYSTEM, maxTokens: 2048, timeoutMs: 45_000 },
        )
        const parsed = parseSeoJson(raw)
        if (parsed) return parsed
      }
    } catch (e) {
      console.warn('[seo-refresh] Serper no disponible, sigo con otras vías:', String(e).slice(0, 150))
    }
  }

  // 2) Pasarela central con búsqueda web (Gemini + Google grounding por debajo; en free tier suele dar 429).
  try {
    const parsed = parseSeoJson(await aiSearch(SEO_SYSTEM, user, { maxTokens: 4000, timeoutMs: 50_000 }))
    if (parsed) return parsed
  } catch (e) {
    console.warn('[seo-refresh] aiSearch (Gemini) no disponible:', String(e).slice(0, 150))
  }

  // 3) ÚLTIMO RECURSO: NIM/Groq texto puro, SIN búsqueda (gratis). SEO desde los datos de la propiedad.
  const parsed = parseSeoJson(await aiComplete([{ role: 'user', content: user }], { system: SEO_SYSTEM, maxTokens: 2048 }))
  if (!parsed) throw new Error('El análisis SEO no devolvió JSON válido (Serper, Gemini y NIM agotados).')
  return parsed
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
        topCompetitors: proposal.top_competitors
          ? (proposal.top_competitors as Prisma.InputJsonValue)
          : Prisma.JsonNull,
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
    // Visibilidad: el cron automático ya no falla en silencio — avisa por el bot del monorepo.
    const safe = String(err).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    await tgAlert(`❌ Agente SEO (housesevillana) falló ${cronOk ? '[cron automático]' : '[manual]'}:\n<code>${safe}</code>`, 'critico')
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
