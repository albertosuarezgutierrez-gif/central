export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { publicarEnInstagram, publicarReel } from '@/lib/instagram'
import { generarReel, warmAndCheckReel } from '@/app/api/ig-reel/route'
import { tgAnswerCallback, tgEditMessage, tgSendPhoto, tgAlertButtons } from '@/lib/telegram'
import { notifyError } from '@/lib/notify'
import { callAI, cleanJSON } from '@/lib/ai-client'
import { obtenerNoticias, leerContextoDrive } from '@/lib/instagram-context'

export async function POST(req: NextRequest) {
  // Verificar secret_token que Telegram envía en X-Telegram-Bot-Api-Secret-Token
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (secret) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token')
    if (incoming !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  }

  const body = await req.json() as {
    callback_query?: { id: string; data: string; message: { message_id: number; text?: string } }
    message?: { text?: string; chat?: { id: number } }
  }

  const supabase = createServerClient()

  // ── Mensaje de texto libre (el operador propone un tema) ──────────────
  if (body.message?.text && body.message.chat) {
    const texto = body.message.text.trim()
    // Solo reaccionar si empieza con / o con palabras clave
    if (texto.startsWith('/ig ') || texto.toLowerCase().startsWith('instagram:')) {
      const tema = texto.replace(/^\/ig |^instagram:/i, '').trim()

      // Guardar como borrador pendiente con el tema propuesto
      await supabase.from('instagram_borradores').insert({
        plantilla: 'pregunta',
        titulo: tema,
        sub: 'Propuesto por Alberto',
        caption: '',
        tema_elegido: tema,
        modulo_relacionado: 'Manual',
        estado: 'pendiente',
      })

      await tgAlertButtons(
        `✏️ <b>Tema recibido</b>\n\n"${tema}"\n\n¿Genero el post ahora?`,
        'info',
        [[
          { texto: '🎬 Video animado', callback: `ig_generar_manual:video:${encodeURIComponent(tema)}` },
          { texto: '📊 Infografía', callback: `ig_generar_manual:stat:${encodeURIComponent(tema)}` },
        ], [
          { texto: '❓ Pregunta', callback: `ig_generar_manual:pregunta:${encodeURIComponent(tema)}` },
          { texto: '💡 Tip', callback: `ig_generar_manual:tip:${encodeURIComponent(tema)}` },
        ]]
      )
    }
    return NextResponse.json({ ok: true })
  }

  const cb = body.callback_query
  if (!cb) return NextResponse.json({ ok: true })

  const parts = cb.data.split(':')
  const accion = parts[0]

  // ── Acciones del CRM/ventas → las maneja /api/telegram/webhook ─────────
  // Este endpoint es el webhook del bot (Telegram postea aquí), pero solo sabe
  // de Instagram/blog. Lo que es del CRM (propuestas, emails de venta, WhatsApp)
  // lo reenviamos al dispatcher de ventas, que valida por chat_id.
  const CRM_ACCIONES = new Set([
    'propuesta_ok', 'propuesta_no', 'propuesta_foco', 'enviar_email', 'revisar_email',
    'enviar_sevilla', 'descartar_sevilla', 'ver_whatsapp', 'qa_activar', 'qa_descartar',
  ])
  if (CRM_ACCIONES.has(accion)) {
    await fetch(`https://www.iarest.es/api/telegram/webhook?secret=${encodeURIComponent(process.env.TELEGRAM_WEBHOOK_SECRET ?? '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch((e) => console.error('[tg] reenvío CRM:', e))
    return NextResponse.json({ ok: true })
  }

  // ── Aprobar y publicar REEL ───────────────────────────────────────────
  if (accion === 'ig_aprobar_reel') {
    const borradorId = parts[1]
    const { data: b } = await supabase.from('instagram_borradores').select('*').eq('id', borradorId).single()
    if (!b || b.estado !== 'pendiente') { await tgAnswerCallback(cb.id, 'Ya procesado'); return NextResponse.json({ ok: true }) }
    await tgAnswerCallback(cb.id, '⏳ Publicando Reel...')
    try {
      const postId = await publicarReel(b.image_url, b.caption)
      await supabase.from('instagram_posts').insert({
        post_id: postId, plantilla: 'reel', titulo: b.titulo, caption: b.caption,
        image_url: b.image_url, tema_elegido: b.tema_elegido, modulo_relacionado: b.modulo_relacionado,
        estado: 'publicado', tipo: 'reel',
      })
      await supabase.from('instagram_borradores').update({ estado: 'publicado' }).eq('id', borradorId)
      await tgEditMessage(cb.message.message_id, `✅ Reel publicado`)
    } catch (e) {
      notifyError({ tipo: 'instagram_publish_reel', modulo: 'sistema', nivel: 'aviso', mensaje: `Fallo publicando Reel: ${(e as Error).message}`, detalle: { borradorId } })
      await tgAlertButtons(`⚠️ Error publicando Reel: ${(e as Error).message}`, 'aviso', [])
    }
    return NextResponse.json({ ok: true })
  }

  // ── Aprobar y publicar borrador ───────────────────────────────────────
  if (accion === 'ig_aprobar') {
    const borradorId = parts[1]
    const { data: b } = await supabase.from('instagram_borradores').select('*').eq('id', borradorId).single()
    if (!b || b.estado !== 'pendiente') { await tgAnswerCallback(cb.id, 'Ya procesado'); return NextResponse.json({ ok: true }) }

    try {
      const postId = await publicarEnInstagram(b.image_url, b.caption)
      await supabase.from('instagram_posts').insert({
        post_id: postId, plantilla: b.plantilla, titulo: b.titulo,
        caption: b.caption, image_url: b.image_url,
        tema_elegido: b.tema_elegido, modulo_relacionado: b.modulo_relacionado,
        estado: 'publicado', tipo: 'imagen',
      })
      await supabase.from('instagram_borradores').update({ estado: 'aprobado', aprobado_at: new Date().toISOString() }).eq('id', borradorId)
      await tgEditMessage(cb.message.message_id, `✅ <b>Instagram publicado</b>\n\n${b.titulo?.slice(0,60)}\nPost: <code>${postId}</code>`)
      await tgAnswerCallback(cb.id, '✅ Publicado')
      await tgSendPhoto(b.image_url, `📱 <b>Story pendiente</b>\nMantén pulsada → Compartir como Story → Publicar`)
    } catch (err: any) {
      notifyError({ tipo: 'instagram_publish', modulo: 'sistema', nivel: 'aviso', mensaje: `Fallo publicando post: ${err?.message}`, detalle: { borradorId } })
      await tgAnswerCallback(cb.id, `❌ ${err.message.slice(0,50)}`)
      await tgEditMessage(cb.message.message_id, `❌ Error: ${err.message.slice(0,100)}`)
    }
  }

  // ── Briefing semanal — fire-and-forget, no esperamos respuesta ───────
  if (accion === 'briefing_elegir' || accion === 'briefing_otras') {
    await tgAnswerCallback(cb.id, '⏳ Generando blog + posts IG...')
    await tgEditMessage(cb.message.message_id,
      `⏳ <b>Generando contenido de la semana...</b>\n\nBlog + 3 posts Instagram\nEn ~1 minuto te llegan los resultados`)
    // Fire-and-forget — no bloqueamos la respuesta al webhook de TG
    fetch('https://www.iarest.es/api/telegram/briefing-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  // ── Aprobar publicar en blog ──────────────────────────────────────────
  if (accion === 'blog_publicar') {
    const borradorId = parts[1]
    const slug = parts[2]
    await tgAnswerCallback(cb.id, '✅ Ve a /super para publicar')
    await tgEditMessage(cb.message.message_id,
      `📝 <b>Artículo listo</b>\n\n` +
      `Publica desde:\n👉 <a href="https://www.iarest.es/super?tab=blog">iarest.es/super → Blog</a>`)
  }

  if (accion === 'blog_revisar') {
    const slug = parts[1]
    await tgAnswerCallback(cb.id, '')
    await tgEditMessage(cb.message.message_id,
      `📝 <b>Artículo en borrador</b>\n\n` +
      `Revisa y publica desde:\n👉 <a href="https://www.iarest.es/super?tab=blog">iarest.es/super → Blog</a>`)
  }

  // ── Generar post desde idea del briefing ──────────────────────────────
  if (accion === 'ig_generar_idea') {
    const borradorId = parts[1]
    const formato = parts[2] || 'pregunta'
    await tgAnswerCallback(cb.id, '⏳ Generando...')
    await tgEditMessage(cb.message.message_id, `⏳ <b>Generando post...</b>\n\nFormato: ${formato}`)

    const { data: b } = await supabase.from('instagram_borradores').select('*').eq('id', borradorId).single()
    if (!b) return NextResponse.json({ ok: true })

    try {
      // Generar contenido con NIM
      const noticias = await obtenerNoticias().catch(() => [])
      const prompt = `Agente Instagram ia.rest. Plantilla "${formato}" sobre: "${b.titulo}"
Fuente: ${b.sub || 'conversación con hostelero'}
${b.caption ? `Frase original: "${b.caption}"` : ''}
PROHIBIDO competidores por nombre.
CAPTION 150-200 palabras. Sin emoji inicio. URL: www.iarest.es
Hashtags: #hosteleria #restaurante #bar #gestion #hosteleros
SOLO JSON: {"titulo":"...","sub":"...","dato":"...","unidad":"...","ctx":"...","items":"...","caption":"..."}`

      const raw = await callAI('Genera post Instagram. SOLO JSON.', prompt, 500, 20_000, true)
      const p = JSON.parse(cleanJSON(raw))

      const params = new URLSearchParams({ tipo: formato })
      if (p.titulo) params.set('titulo', p.titulo)
      if (p.sub) params.set('sub', p.sub)
      if (p.dato) params.set('dato', p.dato)
      if (p.unidad) params.set('unidad', p.unidad)
      if (p.ctx) params.set('ctx', p.ctx)
      if (p.items) params.set('items', p.items)
      const imageUrl = `https://www.iarest.es/api/ig-img?${params.toString()}`

      await supabase.from('instagram_borradores').update({
        plantilla: formato, titulo: p.titulo || b.titulo,
        caption: p.caption, image_url: imageUrl, estado: 'pendiente',
      }).eq('id', borradorId)

      await tgSendPhoto(
        imageUrl,
        `📸 <b>Borrador listo</b>\n\n<b>${(p.titulo || b.titulo).slice(0,60)}</b>\n\n${p.caption?.slice(0,150)}...`
      )

      await tgAlertButtons(
        `¿Publicamos este post?`,
        'info',
        [[
          { texto: '✅ Publicar', callback: `ig_aprobar:${borradorId}` },
          { texto: '🗑️ Descartar', callback: `ig_descartar:${borradorId}` },
        ]]
      )
    } catch (err: any) {
      await tgEditMessage(cb.message.message_id, `❌ Error generando: ${err.message.slice(0,100)}`)
    }
  }

  // ── Generar tema propuesto manualmente ────────────────────────────────
  if (accion === 'ig_generar_manual') {
    const formato = parts[1]
    const tema = decodeURIComponent(parts.slice(2).join(':'))
    await tgAnswerCallback(cb.id, '⏳ Generando...')

    const { data: b } = await supabase
      .from('instagram_borradores')
      .select('id')
      .eq('tema_elegido', tema)
      .eq('estado', 'pendiente')
      .limit(1)
      .maybeSingle()

    if (b?.id) {
      // ── Formato VIDEO → generar Reel animado (slides → Cloudinary MP4) ──
      if (formato === 'video') {
        const prompt = `Agente Instagram ia.rest. Genera contenido para un Reel vertical sobre: "${tema}".
Devuelve un titulo de portada (max 55 chars) y 3 puntos clave cortos (max 70 chars cada uno) que expliquen el tema a un hostelero. Y un caption de 150 palabras terminando en www.iarest.es con hashtags de hostelería.
SOLO JSON: {"titulo":"...","p1":"...","p2":"...","p3":"...","caption":"..."}`
        const raw = await callAI('Genera Reel Instagram. SOLO JSON.', prompt, 500, 30_000, true)
        const p = JSON.parse(cleanJSON(raw))
        const puntos = [p.p1, p.p2, p.p3].filter(Boolean) as string[]
        try {
          const reelUrl = await generarReel({ titulo: p.titulo || tema, estilo: 'editorial', puntos })
          await warmAndCheckReel(reelUrl).catch(() => {}) // calienta el MP4 (best-effort)
          await supabase.from('instagram_borradores').update({
            plantilla: 'reel', titulo: p.titulo || tema, caption: p.caption, image_url: reelUrl,
          }).eq('id', b.id)
          await tgAlertButtons(
            `🎬 <b>Reel listo</b>\n\n<b>${(p.titulo || tema).slice(0,60)}</b>\n\n<i>${p.caption?.slice(0,150)}...</i>\n\n<a href="${reelUrl}">👁️ Ver vídeo</a>`,
            'info',
            [[{ texto: '✅ Publicar Reel', callback: `ig_aprobar_reel:${b.id}` }, { texto: '🗑️ Descartar', callback: `ig_descartar:${b.id}` }]]
          )
        } catch (e) {
          await tgAlertButtons(`⚠️ Error generando Reel: ${(e as Error).message}`, 'aviso', [])
        }
        return NextResponse.json({ ok: true })
      }

      // ── Resto de formatos → imagen ──
      const prompt = `Agente Instagram ia.rest. Plantilla "${formato}" sobre: "${tema}"
SOLO JSON: {"titulo":"...","sub":"...","dato":"...","unidad":"...","ctx":"...","items":"...","caption":"..."}`
      const raw = await callAI('Genera post Instagram. SOLO JSON.', prompt, 500, 20_000, true)
      const p = JSON.parse(cleanJSON(raw))
      const params = new URLSearchParams({ tipo: formato })
      if (p.titulo) params.set('titulo', p.titulo)
      if (p.sub) params.set('sub', p.sub)
      if (p.dato) params.set('dato', p.dato)
      if (p.unidad) params.set('unidad', p.unidad)
      if (p.ctx) params.set('ctx', p.ctx)
      if (p.items) params.set('items', p.items)
      const imageUrl = `https://www.iarest.es/api/ig-img?${params.toString()}`
      await supabase.from('instagram_borradores').update({
        plantilla: formato, titulo: p.titulo || tema, caption: p.caption, image_url: imageUrl
      }).eq('id', b.id)
      await tgSendPhoto(imageUrl, `📸 <b>Borrador</b>\n\n${p.caption?.slice(0,150)}...`)
      await tgAlertButtons('¿Publicamos?', 'info', [[
        { texto: '✅ Publicar', callback: `ig_aprobar:${b.id}` },
        { texto: '🗑️ Descartar', callback: `ig_descartar:${b.id}` },
      ]])
    }
  }

  // ── Descartar ─────────────────────────────────────────────────────────
  if (accion === 'ig_descartar') {
    const borradorId = parts[1]
    await supabase.from('instagram_borradores').update({ estado: 'descartado' }).eq('id', borradorId)
    await tgEditMessage(cb.message.message_id, `🗑️ Descartado`)
    await tgAnswerCallback(cb.id, 'Descartado')
  }

  // ── Otras ideas / proponer ────────────────────────────────────────────
  if (accion === 'ig_otras_ideas') {
    await tgAnswerCallback(cb.id, 'Generando nuevas ideas...')
    await tgAlertButtons(
      `💡 <b>Para proponer tu propio tema</b>\n\nEscribe en este chat:\n<code>/ig tu idea aquí</code>\n\nEjemplo:\n<code>/ig el cliente me preguntó cómo funciona el KDS</code>`,
      'info',
      [[{ texto: '🔄 Generar otras automáticas', callback: 'ig_regenerar' }]]
    )
  }

  if (accion === 'ig_proponer') {
    await tgAnswerCallback(cb.id, '')
    await tgAlertButtons(
      `✏️ <b>Propón tu tema</b>\n\nEscribe en este chat:\n<code>/ig tu idea o frase del hostelero</code>\n\nEjemplo:\n<code>/ig Ricardo dijo que pierde 1h al día cuadrando caja</code>`,
      'info', []
    )
  }

  return NextResponse.json({ ok: true })
}
