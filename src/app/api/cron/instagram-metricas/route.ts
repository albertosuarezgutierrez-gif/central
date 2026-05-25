export const dynamic = 'force-dynamic'
export const maxDuration = 30
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { obtenerMetricas } from '@/lib/instagram'
import { tgAlert } from '@/lib/telegram'
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const supabase = createServerClient()
  const { data: posts } = await supabase.from('instagram_posts').select('id,post_id').eq('estado','publicado').gte('created_at', new Date(Date.now()-30*86400000).toISOString())
  let actualizados = 0
  for (const post of posts??[]) {
    try {
      const m = await obtenerMetricas(post.post_id)
      await supabase.from('instagram_posts').update({ ...m, metricas_at: new Date().toISOString() }).eq('id', post.id)
      actualizados++
    } catch { /* insights pueden no estar disponibles */ }
  }
  if (actualizados > 0) tgAlert(`📊 Instagram: ${actualizados} posts con métricas actualizadas`, 'info')
  return NextResponse.json({ ok: true, actualizados })
}
