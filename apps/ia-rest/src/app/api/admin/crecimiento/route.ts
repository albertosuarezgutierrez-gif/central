export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function autorizado(req: NextRequest): boolean {
  const secret = process.env.OPERADOR_SHARED_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sb = createServerClient()

  const [postsRes, borradoresIgRes, blogRes, landingRes] = await Promise.all([
    sb.from('instagram_posts')
      .select('id, post_id, titulo, caption, image_url, estado, tipo, alcance, likes, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('instagram_borradores')
      .select('id, plantilla, titulo, caption, image_url, tema_elegido, estado, created_at')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false }),
    sb.from('blog_borradores')
      .select('id, slug, titulo, keyword, meta_description, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(30),
    sb.from('leads_landing')
      .select('id, fuente, nombre, email, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const posts = postsRes.data ?? []
  const publicados = posts.filter((p: any) => p.estado === 'publicado')

  return NextResponse.json({
    instagram: {
      posts,
      borradores: borradoresIgRes.data ?? [],
      resumen: {
        publicados: publicados.length,
        totalAlcance: publicados.reduce((s: number, p: any) => s + (p.alcance || 0), 0),
        totalLikes: publicados.reduce((s: number, p: any) => s + (p.likes || 0), 0),
      },
    },
    blog: { borradores: blogRes.data ?? [] },
    landing: { leads: landingRes.data ?? [] },
  })
}
