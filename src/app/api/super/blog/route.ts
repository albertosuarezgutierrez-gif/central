export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data: borradores } = await supabase
    .from('blog_borradores')
    .select('id, slug, titulo, keyword, meta_description, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ borradores: borradores ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { accion, id, slug } = await req.json()

  if (accion === 'publicar') {
    // Obtener TSX del borrador
    const { data: b } = await supabase
      .from('blog_borradores')
      .select('contenido_tsx, slug, titulo')
      .eq('id', id)
      .single()

    if (!b) return NextResponse.json({ error: 'Borrador no encontrado' }, { status: 404 })

    // Publicar en GitHub via API
    const filePath = `src/app/blog/${b.slug}/page.tsx`
    const content = Buffer.from(b.contenido_tsx).toString('base64')

    const ghRes = await fetch(
      `https://api.github.com/repos/albertosuarezgutierrez-gif/ia.rest/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `blog: publicar artículo ${b.slug}`,
          content,
        }),
      }
    )

    if (!ghRes.ok) {
      const err = await ghRes.json()
      return NextResponse.json({ error: `GitHub: ${err.message}` }, { status: 500 })
    }

    await supabase.from('blog_borradores').update({ estado: 'publicado' }).eq('id', id)
    return NextResponse.json({ ok: true, slug: b.slug })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
