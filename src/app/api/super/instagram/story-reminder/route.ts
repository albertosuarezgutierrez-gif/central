export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { tgSendPhoto } from '@/lib/telegram'
export async function POST(req: NextRequest) {
  if (req.headers.get('x-story-secret') !== process.env.CRON_SECRET) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { posts } = await req.json() as { posts: Array<{ titulo: string; image_url: string; num: number; total: number }> }
  let enviados = 0
  for (const post of posts) {
    await tgSendPhoto(post.image_url, `📱 <b>Story ${post.num}/${post.total}</b> — ${post.titulo}\n\nMantén pulsada → <b>Compartir como Story</b> → Publicar\n\n<i>24h · Alcance x2-3</i>`)
    enviados++
    await new Promise(r => setTimeout(r, 1500))
  }
  return NextResponse.json({ ok: true, enviados })
}
