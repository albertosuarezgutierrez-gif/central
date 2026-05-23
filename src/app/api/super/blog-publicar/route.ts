export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/session'

const GH_PAT   = process.env.GH_PAT || ''
const GH_REPO  = 'albertosuarezgutierrez-gif/ia.rest'
const TG_BOT   = process.env.TELEGRAM_BOT_TOKEN || ''
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID || ''

async function commitToGithub(slug: string, tsx: string): Promise<string> {
  const path = `src/app/blog/${slug}/page.tsx`
  const content = Buffer.from(tsx).toString('base64')

  // Verificar si el archivo ya existe (para obtener sha)
  let sha: string | undefined
  const checkRes = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
    { headers: { Authorization: `token ${GH_PAT}` } }
  )
  if (checkRes.ok) {
    const existing = await checkRes.json()
    sha = existing.sha
  }

  const body: any = {
    message: `blog: auto-publish "${slug}" — generado por agente SEO`,
    content,
    branch: 'main',
  }
  if (sha) body.sha = sha

  const res = await fetch(
    `https://api.github.com/repos/${GH_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: { Authorization: `token ${GH_PAT}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`GitHub error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content?.sha || ''
}

async function solicitarIndexacion(slug: string): Promise<void> {
  try {
    const rt = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    if (!rt) return
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: rt,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      }),
    })
    const { access_token } = await tokenRes.json()
    if (!access_token) return

    // GSC — solicitar indexación vía Indexing API (requiere scope adicional, por ahora fetch inspect)
    await fetch('https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.iarest.es%2F/sitemaps', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
  } catch { /* no crítico */ }
}

async function enviarTelegram(msg: string) {
  if (!TG_BOT || !TG_CHAT) return
  await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TG_CHAT, text: msg, parse_mode: 'HTML' }),
  })
}

// GET — listar borradores
export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('blog_borradores')
    .select('id, slug, titulo, keyword, meta_description, estado, created_at, published_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ borradores: data })
}

// POST — publicar o rechazar
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session || session.rol !== 'super_admin')
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = createServerClient()
  const { id, accion } = await req.json()

  if (!id || !['publicar', 'rechazar'].includes(accion))
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })

  // Leer borrador
  const { data: borrador, error } = await supabase
    .from('blog_borradores')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !borrador)
    return NextResponse.json({ error: 'Borrador no encontrado' }, { status: 404 })

  if (accion === 'rechazar') {
    await supabase.from('blog_borradores').update({ estado: 'rechazado' }).eq('id', id)
    return NextResponse.json({ ok: true, accion: 'rechazado' })
  }

  // PUBLICAR
  try {
    // 1. Commit a GitHub
    const sha = await commitToGithub(borrador.slug, borrador.contenido_tsx)

    // 2. Actualizar estado en BD
    await supabase
      .from('blog_borradores')
      .update({ estado: 'publicado', github_sha: sha, published_at: new Date().toISOString() })
      .eq('id', id)

    // 3. Solicitar indexación en GSC
    await solicitarIndexacion(borrador.slug)

    // 4. Telegram
    await enviarTelegram(
      `✅ <b>Artículo publicado</b>\n\n` +
      `<b>${borrador.titulo}</b>\n` +
      `🔗 https://www.iarest.es/blog/${borrador.slug}\n\n` +
      `Vercel desplegará en ~60 segundos. Solicita indexación en GSC cuando esté live.`
    )

    return NextResponse.json({ ok: true, url: `https://www.iarest.es/blog/${borrador.slug}` })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
