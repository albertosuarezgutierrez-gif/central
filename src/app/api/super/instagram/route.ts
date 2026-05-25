export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { publicarEnInstagram } from '@/lib/instagram'
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const [{ data: posts }, { data: borradores }] = await Promise.all([
    supabase.from('instagram_posts').select('*').order('created_at',{ascending:false}).limit(20),
    supabase.from('instagram_borradores').select('*').eq('estado','pendiente').order('created_at',{ascending:false}),
  ])
  const publicados = posts?.filter(p => p.estado==='publicado') ?? []
  return NextResponse.json({ posts, borradores, resumen: { publicados: publicados.length, totalAlcance: publicados.reduce((s,p)=>s+(p.alcance||0),0), totalLikes: publicados.reduce((s,p)=>s+(p.likes||0),0) } })
}
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin') return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const body = await req.json()
  if (body.accion === 'publicar_borrador') {
    const { data: b } = await supabase.from('instagram_borradores').select('*').eq('id', body.borrador_id).single()
    if (!b) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    const postId = await publicarEnInstagram(b.image_url, b.caption)
    await supabase.from('instagram_posts').insert({ post_id: postId, plantilla: b.plantilla, titulo: b.titulo, caption: b.caption, image_url: b.image_url, tema_elegido: b.tema_elegido, modulo_relacionado: b.modulo_relacionado, estado: 'publicado', tipo: 'imagen' })
    await supabase.from('instagram_borradores').update({ estado: 'aprobado', aprobado_at: new Date().toISOString() }).eq('id', body.borrador_id)
    return NextResponse.json({ ok: true, postId })
  }
  if (body.accion === 'actualizar_caption') {
    await supabase.from('instagram_borradores').update({ caption: body.caption }).eq('id', body.borrador_id)
    return NextResponse.json({ ok: true })
  }
  if (body.accion === 'descartar_borrador') {
    await supabase.from('instagram_borradores').update({ estado: 'descartado' }).eq('id', body.borrador_id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
