// /api/telegram/briefing-callback — Genera blog + 3 posts IG cuando Alberto elige tema
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { tgAnswerCallback, tgEditMessage, tgAlertButtons, tgAlert } from '@/lib/telegram'

// ── Importar generarArticulo del blog-seo ────────────────────────────────
async function generarArticuloBlog(keyword: string): Promise<{titulo: string; slug: string; tsx: string; meta: string}> {
  const slug = keyword.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const prompt = `Eres un experto en SEO y hostelería española. Escribe un artículo completo de blog para ia.rest.

KEYWORD: "${keyword}"
SLUG: /blog/${slug}
PÚBLICO: dueños de bares y restaurantes en España
TONO: directo, práctico, sin palabrería corporativa
LONGITUD: 1200-1500 palabras
PROHIBIDO: mencionar competidores por nombre

Incluye: introducción con el problema, 3-4 secciones H2 con contenido práctico, conclusión con CTA a ia.rest.

Responde SOLO JSON:
{
  "titulo": "título SEO (55-60 chars)",
  "meta_description": "meta descripción (150-160 chars)",
  "h1": "h1 del artículo",
  "intro": "párrafo introductorio (100-120 palabras)",
  "secciones": [
    {"h2": "título sección", "contenido": "contenido 200-300 palabras"}
  ],
  "conclusion": "conclusión con CTA (80-100 palabras)"
}`

  const raw = await callAI('Genera artículo de blog SEO para hostelería. SOLO JSON.', prompt, 2000)
  const data = JSON.parse(cleanJSON(raw))

  // Generar TSX básico
  const tsx = `import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '${data.titulo.replace(/'/g, "\\'")}',
  description: '${data.meta_description?.replace(/'/g, "\\'")}',
  alternates: { canonical: 'https://www.iarest.es/blog/${slug}' },
  openGraph: {
    title: '${data.titulo.replace(/'/g, "\\'")}',
    description: '${data.meta_description?.replace(/'/g, "\\'")}',
    url: 'https://www.iarest.es/blog/${slug}',
    type: 'article',
  },
}

export default function Page() {
  return (
    <article style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'Inter Tight, sans-serif', color: '#1A1714', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 700, marginBottom: 24, lineHeight: 1.2 }}>${data.h1 || data.titulo}</h1>
      <p style={{ fontSize: 18, color: '#6B5F52', marginBottom: 40 }}>${data.intro}</p>
      ${(data.secciones || []).map((s: any) => `
      <h2 style={{ fontSize: 'clamp(20px,3vw,26px)', fontWeight: 600, margin: '40px 0 16px' }}>${s.h2}</h2>
      <p style={{ marginBottom: 24 }}>${s.contenido}</p>`).join('')}
      <h2 style={{ fontSize: 'clamp(20px,3vw,26px)', fontWeight: 600, margin: '40px 0 16px' }}>Conclusión</h2>
      <p style={{ marginBottom: 32 }}>${data.conclusion}</p>
      <div style={{ background: '#D9442B', color: '#fff', padding: '24px 32px', borderRadius: 12, textAlign: 'center' as const }}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>¿Quieres probarlo en tu restaurante?</p>
        <a href="https://www.iarest.es" style={{ color: '#fff', textDecoration: 'underline' }}>14 días gratis · Sin contrato · Sin comisión</a>
      </div>
    </article>
  )
}`

  return { titulo: data.titulo, slug, tsx, meta: data.meta_description || '' }
}

// ── Generar caption para post IG ─────────────────────────────────────────
async function generarCaption(tema: string, angulo: string, formato: string): Promise<string> {
  const prompt = `Caption Instagram ia.rest. Tema: "${tema}". Ángulo: "${angulo}". Formato: ${formato}.
150-200 palabras. Sin emoji inicio. Máx 1 emoji. URL: www.iarest.es
Hashtags: #hosteleria #restaurante #bar #gestion #hosteleros
SOLO el caption, sin comillas.`
  return (await callAI('Caption Instagram hostelería.', prompt, 300)).trim()
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    callback_query?: { id: string; data: string; message: { message_id: number } }
  }

  const cb = body.callback_query
  if (!cb) return NextResponse.json({ ok: true })

  const parts = cb.data.split(':')
  const accion = parts[0]

  if (accion !== 'briefing_elegir') return NextResponse.json({ ok: true })

  const semanaId = parts[1]
  const numElegido = parseInt(parts[2])

  await tgAnswerCallback(cb.id, '⏳ Generando toda la semana...')
  await tgEditMessage(cb.message.message_id,
    `⏳ <b>Generando contenido de la semana...</b>\n\nBlog + 3 posts Instagram\nEsto tarda ~1 minuto`)

  const supabase = createServerClient()

  try {
    // Recuperar el tema elegido
    const { data: semanaRow } = await supabase
      .from('instagram_semana')
      .select('temas')
      .eq('id', semanaId)
      .single()
      

    const temas = semanaRow?.temas || []
    const tema = temas.find((t: any) => t.num === numElegido) || temas[0]

    if (!tema) throw new Error('Tema no encontrado')

    await tgEditMessage(cb.message.message_id,
      `⏳ <b>Tema elegido: ${tema.tema}</b>\n\n📰 Generando artículo blog...`)

    // ── 1. Generar artículo blog ──────────────────────────────────────
    const { titulo, slug, tsx, meta } = await generarArticuloBlog(tema.keyword_blog)

    // Guardar borrador blog
    const { data: borrador } = await supabase
      .from('blog_borradores')
      .insert({ slug, titulo, keyword: tema.keyword_blog, meta_description: meta, contenido_tsx: tsx, estado: 'borrador' })
      .select('id').single()
      

    await tgEditMessage(cb.message.message_id,
      `⏳ <b>Blog listo</b> ✅\n\n📸 Generando 3 posts Instagram...`)

    // Guardar tema elegido en BD
    await supabase.from('instagram_semana')
      .update({ tema_elegido: tema, estado: 'en_curso' })
      .eq('id', semanaId)
      

    // ── 2. Generar los 3 posts IG ─────────────────────────────────────
    const ahora = new Date()
    const lunes    = new Date(ahora); lunes.setHours(10, 0, 0, 0)
    const miercoles = new Date(ahora); miercoles.setDate(ahora.getDate() + 2); miercoles.setHours(9, 0, 0, 0)
    const viernes   = new Date(ahora); viernes.setDate(ahora.getDate() + 4);   viernes.setHours(9, 0, 0, 0)

    const schedules = [lunes, miercoles, viernes]
    const borradorIds: string[] = []

    for (let i = 0; i < tema.posts_ig.length && i < 3; i++) {
      const post = tema.posts_ig[i]
      const caption = await generarCaption(tema.tema, post.angulo, post.formato)
      const params = new URLSearchParams({ tipo: post.formato })
      params.set('titulo', `${tema.tema} — ${post.angulo}`)

      const imageUrl = `https://www.iarest.es/api/ig-img?${params.toString()}`

      const { data: b } = await supabase.from('instagram_borradores').insert({
        plantilla: post.formato === 'video' ? 'producto' : post.formato,
        titulo: `${tema.tema} (${post.dia})`,
        sub: post.angulo,
        caption,
        image_url: imageUrl,
        tema_elegido: tema.tema,
        modulo_relacionado: tema.fuente,
        scheduled_for: schedules[i].toISOString(),
        semana_id: semanaId,
        estado: 'pendiente',
      }).select('id').single()

      if (b?.id) borradorIds.push(b.id)
    }

    // ── 3. Mensaje final con resumen ──────────────────────────────────
    await tgEditMessage(cb.message.message_id,
      `✅ <b>Semana generada</b>\n\n` +
      `📰 Blog: <b>${titulo}</b>\n` +
      `👉 https://www.iarest.es/super → tab Blog\n\n` +
      `📸 Instagram (${tema.posts_ig.length} posts):\n` +
      tema.posts_ig.map((p: any, i: number) =>
        `   ${p.dia}: ${p.formato} — <i>${p.angulo.slice(0,40)}</i>`
      ).join('\n') + '\n\n' +
      `Todo en /super → 📸 Instagram → Borradores`
    )

    // Notificar blog por separado
    await tgAlertButtons(
      `📝 <b>Artículo listo para revisar</b>\n\n<b>${titulo}</b>\n/blog/${slug}\n\n¿Lo publicamos?`,
      'info',
      [[
        { texto: '✅ Publicar en blog', callback: `blog_publicar:${borrador?.id}:${slug}` },
        { texto: '👁 Revisar primero', callback: `blog_revisar:${slug}` },
      ]]
    )

    return NextResponse.json({ ok: true, tema: tema.tema, blog: slug, ig_posts: borradorIds.length })

  } catch (err: any) {
    await tgEditMessage(cb.message.message_id, `❌ Error: ${err.message.slice(0,100)}`)
    await tgAlert(`❌ Briefing semanal error: ${err.message}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
