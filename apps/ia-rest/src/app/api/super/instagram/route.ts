export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'
import { publicarEnInstagram } from '@/lib/instagram'
import { tgAlertButtons } from '@/lib/telegram'
import { notifyError } from '@/lib/notify'
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
    try {
      const postId = await publicarEnInstagram(b.image_url, b.caption)
      await supabase.from('instagram_posts').insert({ post_id: postId, plantilla: b.plantilla, titulo: b.titulo, caption: b.caption, image_url: b.image_url, tema_elegido: b.tema_elegido, modulo_relacionado: b.modulo_relacionado, estado: 'publicado', tipo: 'imagen' })
      await supabase.from('instagram_borradores').update({ estado: 'aprobado', aprobado_at: new Date().toISOString() }).eq('id', body.borrador_id)
      return NextResponse.json({ ok: true, postId })
    } catch (err: any) {
      notifyError({ tipo: 'instagram_publish', modulo: 'sistema', nivel: 'aviso', mensaje: `Fallo publicando post (panel /super): ${err?.message}`, detalle: { borradorId: body.borrador_id } })
      return NextResponse.json({ error: `Error publicando en Instagram: ${err?.message}` }, { status: 502 })
    }
  }
  if (body.accion === 'actualizar_caption') {
    await supabase.from('instagram_borradores').update({ caption: body.caption }).eq('id', body.borrador_id)
    return NextResponse.json({ ok: true })
  }
  if (body.accion === 'descartar_borrador') {
    await supabase.from('instagram_borradores').update({ estado: 'descartado' }).eq('id', body.borrador_id)
    return NextResponse.json({ ok: true })
  }
  if (body.accion === 'enviar_pendientes_telegram') {
    // Empuja todos los borradores pendientes a Telegram con botones ✅/🗑️
    // (mismos callbacks que el cron: ig_aprobar / ig_descartar)
    const { data: pendientes } = await supabase.from('instagram_borradores')
      .select('*').eq('estado', 'pendiente')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
    let enviados = 0
    for (const b of pendientes ?? []) {
      const msgId = await tgAlertButtons(
        `📸 <b>Post Instagram listo</b>\n\n<code>${b.plantilla}</code>${b.tema_elegido ? ` · ${b.tema_elegido}` : ''}\n\n<b>${(b.titulo || '').slice(0, 70)}</b>\n\n<i>${(b.caption || '').slice(0, 150)}…</i>`,
        'info',
        [[
          { texto: '✅ Publicar', callback: `ig_aprobar:${b.id}` },
          { texto: '🗑️ Descartar', callback: `ig_descartar:${b.id}` },
        ]]
      )
      if (msgId) { await supabase.from('instagram_borradores').update({ telegram_msg_id: msgId }).eq('id', b.id); enviados++ }
    }
    return NextResponse.json({ ok: true, enviados, total: pendientes?.length ?? 0 })
  }
  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
