export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const estado  = searchParams.get('estado')   // borrador|publicado|todos
  const buscar  = searchParams.get('q')

  let query = supabase
    .from('blog_borradores')
    .select('id, slug, titulo, keyword, meta_description, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (estado && estado !== 'todos') query = query.eq('estado', estado)
  if (buscar) query = query.or(`titulo.ilike.%${buscar}%,keyword.ilike.%${buscar}%,slug.ilike.%${buscar}%`)

  const { data: borradores } = await query
  return NextResponse.json({ borradores: borradores ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const body = await req.json()
  const { accion } = body

  // ── Publicar borrador a GitHub ─────────────────────────────
  if (accion === 'publicar') {
    const { id } = body
    const { data: b } = await supabase
      .from('blog_borradores').select('contenido_tsx, slug, titulo').eq('id', id).single()
    if (!b) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    if (!b.contenido_tsx) return NextResponse.json({ error: 'Sin contenido TSX — regenera el artículo' }, { status: 400 })

    const filePath = `src/app/blog/${b.slug}/page.tsx`
    const content = Buffer.from(b.contenido_tsx).toString('base64')

    // Ver si ya existe para incluir el SHA (necesario para actualizar)
    let sha: string | undefined
    const existing = await fetch(
      `https://api.github.com/repos/albertosuarezgutierrez-gif/ia.rest/contents/${filePath}`,
      { headers: { 'Authorization': `Bearer ${process.env.GH_PAT}` } }
    ).then(r => r.ok ? r.json() : null).catch(() => null)
    if (existing?.sha) sha = existing.sha

    const ghRes = await fetch(
      `https://api.github.com/repos/albertosuarezgutierrez-gif/ia.rest/contents/${filePath}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${process.env.GH_PAT}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `blog: publicar ${b.slug}`, content, ...(sha ? { sha } : {}) }),
      }
    )
    if (!ghRes.ok) {
      const err = await ghRes.json()
      return NextResponse.json({ error: `GitHub: ${err.message}` }, { status: 500 })
    }

    await supabase.from('blog_borradores').update({ estado: 'publicado' }).eq('id', id)
    return NextResponse.json({ ok: true, slug: b.slug })
  }

  // ── Guardar edición (título, meta, keyword) ────────────────
  if (accion === 'editar_meta') {
    const { id, titulo, keyword, meta_description } = body
    await supabase.from('blog_borradores')
      .update({ titulo, keyword, meta_description })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── Guardar edición de contenido TSX ──────────────────────
  if (accion === 'editar_contenido') {
    const { id, contenido_tsx } = body
    await supabase.from('blog_borradores').update({ contenido_tsx }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // ── Cargar TSX desde GitHub (artículos publicados sin TSX en BD) ──
  if (accion === 'cargar_tsx') {
    const { slug } = body
    const filePath = `src/app/blog/${slug}/page.tsx`
    const ghRes = await fetch(
      `https://api.github.com/repos/albertosuarezgutierrez-gif/ia.rest/contents/${filePath}`,
      { headers: { 'Authorization': `Bearer ${process.env.GH_PAT}` } }
    )
    if (!ghRes.ok) return NextResponse.json({ error: 'No encontrado en GitHub' }, { status: 404 })
    const data = await ghRes.json()
    const tsx = Buffer.from(data.content, 'base64').toString('utf-8')

    // Guardar en BD
    await supabase.from('blog_borradores').update({ contenido_tsx: tsx }).eq('slug', slug)
    return NextResponse.json({ ok: true, tsx })
  }

  // ── Regenerar artículo con IA ──────────────────────────────
  if (accion === 'regenerar') {
    const { id } = body
    const { data: b } = await supabase
      .from('blog_borradores').select('slug, keyword, titulo').eq('id', id).single()
    if (!b) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    // Reusar el generador del blog-seo
    const cronRes = await fetch(
      `https://www.iarest.es/api/cron/blog-seo?manual=1&keyword=${encodeURIComponent(b.keyword || b.titulo)}`,
      { headers: { 'authorization': `Bearer ${process.env.CRON_SECRET}` } }
    )
    return NextResponse.json({ ok: cronRes.ok })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
