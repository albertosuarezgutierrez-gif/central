export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { publicarEnInstagram } from '@/lib/instagram'
import { tgAnswerCallback, tgEditMessage, tgSendPhoto } from '@/lib/telegram'
export async function POST(req: NextRequest) {
  const body = await req.json() as { callback_query?: { id: string; data: string; message: { message_id: number } } }
  const cb = body.callback_query
  if (!cb) return NextResponse.json({ ok: true })
  const [accion, borradorId] = cb.data.split(':')
  const supabase = createServerClient()
  if (accion === 'ig_aprobar') {
    const { data: b } = await supabase.from('instagram_borradores').select('*').eq('id', borradorId).single()
    if (!b || b.estado !== 'pendiente') { await tgAnswerCallback(cb.id, 'Ya procesado'); return NextResponse.json({ ok: true }) }
    try {
      const postId = await publicarEnInstagram(b.image_url, b.caption)
      await supabase.from('instagram_posts').insert({ post_id: postId, plantilla: b.plantilla, titulo: b.titulo, caption: b.caption, image_url: b.image_url, tema_elegido: b.tema_elegido, modulo_relacionado: b.modulo_relacionado, estado: 'publicado', tipo: 'imagen' })
      await supabase.from('instagram_borradores').update({ estado: 'aprobado', aprobado_at: new Date().toISOString() }).eq('id', borradorId)
      await tgEditMessage(cb.message.message_id, `✅ <b>Instagram publicado</b>\n\n${b.titulo?.slice(0,60)}\nPost: <code>${postId}</code>`)
      await tgAnswerCallback(cb.id, '✅ Publicado')
      await tgSendPhoto(b.image_url, `📱 <b>Story pendiente</b>\n\nMantén pulsada → <b>Compartir como Story</b> → Publicar\n\n<i>24h · Alcance x2-3</i>`)
    } catch (err: any) {
      await tgAnswerCallback(cb.id, `❌ ${err.message.slice(0,50)}`)
      await tgEditMessage(cb.message.message_id, `❌ Error: ${err.message.slice(0,100)}`)
    }
  }
  if (accion === 'ig_descartar') {
    await supabase.from('instagram_borradores').update({ estado: 'descartado' }).eq('id', borradorId)
    await tgEditMessage(cb.message.message_id, `🗑️ Post descartado`)
    await tgAnswerCallback(cb.id, 'Descartado')
  }
  if (accion === 'ig_editar') await tgAnswerCallback(cb.id, 'Edita en /super → Instagram → Borradores')
  return NextResponse.json({ ok: true })
}
