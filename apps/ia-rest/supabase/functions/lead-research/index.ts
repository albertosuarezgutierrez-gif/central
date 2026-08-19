// supabase/functions/lead-research/index.ts
// v4 — busca email automáticamente. Sin email = lead pausado

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'iarest' } }
  )
  const NVIDIA_KEY = Deno.env.get('NVIDIA_API_KEY')!
  const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
  const TG_CHAT = Deno.env.get('TELEGRAM_CHAT_ID')!

  try {
    const { lead_id } = await req.json()
    if (!lead_id) throw new Error('lead_id requerido')

    const { data: lead } = await supabase.from('leads').select('*').eq('id', lead_id).single()
    if (!lead) throw new Error('Lead no encontrado')

    // Guard anti-duplicado
    if (lead.research_at) {
      console.log(`[lead-research] Skip: ${lead.empresa} ya tiene research`)
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await supabase.from('leads').update({ estado_pipeline: 'estudiando' }).eq('id', lead_id)

    const empresa = lead.empresa || lead.restaurante || lead.nombre || 'Desconocido'
    const web = lead.web || ''

    // 1. Scraping web + búsqueda de email
    let webContent = ''
    let emailEncontrado = lead.email || ''
    let contactoEncontrado = lead.contacto || ''

    if (web) {
      try {
        const res = await fetch(web, {
          signal: AbortSignal.timeout(7000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ia.rest)' }
        })
        const html = await res.text()
        webContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .substring(0, 3000)

        // Extraer email directamente del HTML
        if (!emailEncontrado) {
          const emailMatch = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)
          if (emailMatch) {
            const excluidos = ['noreply', 'no-reply', 'example', 'test', 'domain', 'email', 'your', 'info@example']
            const validos = emailMatch.filter(e =>
              !excluidos.some(ex => e.toLowerCase().includes(ex)) &&
              !e.includes('wixpress') && !e.includes('sentry') && !e.includes('schema')
            )
            if (validos.length > 0) emailEncontrado = validos[0]
          }
        }

        // Buscar también página de contacto
        if (!emailEncontrado) {
          const baseUrl = new URL(web).origin
          for (const path of ['/contacto', '/contact', '/contactar', '/sobre-nosotros']) {
            try {
              const r2 = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(4000) })
              const h2 = await r2.text()
              const m = h2.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)
              if (m) {
                const excluidos = ['noreply', 'no-reply', 'example', 'wixpress', 'sentry']
                const v = m.filter(e => !excluidos.some(ex => e.toLowerCase().includes(ex)))
                if (v.length > 0) { emailEncontrado = v[0]; break }
              }
            } catch { /* ok */ }
          }
        }
      } catch { /* sin web */ }
    }

    // 2. Si aún no hay email, buscar con NIM en base a nombre+ciudad
    if (!emailEncontrado) {
      try {
        const searchRaw = await callNIM(NVIDIA_KEY,
          'Eres un asistente que ayuda a encontrar información de contacto de empresas. Responde SOLO JSON válido.',
          `Empresa: ${empresa} | Ciudad: ${lead.ciudad || 'Sevilla'} | Web: ${web || 'desconocida'}\n\nBusca el email de contacto comercial o del responsable de esta empresa. Si no lo sabes con certeza, devuelve null.\n\nJSON: {"email": "email@ejemplo.com o null", "contacto_nombre": "Nombre del responsable o null", "fuente": "web/linkedin/directorio"}`,
          200
        )
        const clean = searchRaw.replace(/```json|```/g, '').trim()
        const found = JSON.parse(clean)
        if (found.email && found.email !== 'null' && found.email.includes('@')) {
          emailEncontrado = found.email
          if (found.contacto_nombre && found.contacto_nombre !== 'null') {
            contactoEncontrado = found.contacto_nombre
          }
        }
      } catch { /* ok */ }
    }

    // 3. Guardar email si se encontró
    if (emailEncontrado && emailEncontrado !== lead.email) {
      await supabase.from('leads').update({
        email: emailEncontrado,
        ...(contactoEncontrado && !lead.contacto ? { contacto: contactoEncontrado } : {})
      }).eq('id', lead_id)
    }

    // 4. Generar estudio con NIM
    const estudioRaw = await callNIM(NVIDIA_KEY,
      `Eres consultor experto en hostelería española. Analizas leads para ia.rest SaaS hosteleria.\nMódulos: voz, kds, almacen, contabilidad, qr, storefront, analytics, multi_local, eventos, vinos, bridge, rrhh.\nPrecio: 59€/mes + 20€/u(2-6) + 15€/u(7+). Trial 14d. Sin comisión.\nResponde SOLO JSON válido.`,
      `Lead: ${empresa} | Locales: ${lead.locales || 'N/A'} | TPV: ${lead.tpv || 'N/A'} | Notas: ${lead.notas || 'N/A'} | Web: ${webContent.substring(0, 1200) || 'N/A'}\n\nJSON: {"resumen_negocio":"2 frases","ciudad":"ciudad","tpv_actual":"TPV","pain_points":["p1","p2","p3"],"modulos_criticos":["voz","kds"],"modulos_secundarios":["almacen"],"mrr_estimado":150,"argumento_principal":"1 frase","puntuacion_lead":70}`,
      1000
    )

    let estudio: Record<string, unknown> = {}
    try { estudio = JSON.parse(estudioRaw.replace(/```json|```/g, '').trim()) }
    catch { estudio = { resumen_negocio: empresa, pain_points: ['Gestión manual'], modulos_criticos: ['voz', 'kds'], modulos_secundarios: ['almacen'], mrr_estimado: 120, argumento_principal: `ia.rest para ${empresa}`, puntuacion_lead: 60 } }

    // 5. Guardar en BD
    const { data: c } = await supabase.from('leads').select('eventos').eq('id', lead_id).single()
    const ev = Array.isArray(c?.eventos) ? c.eventos : []
    const emailFinal = emailEncontrado || lead.email || ''

    await supabase.from('leads').update({
      estudio_completo: estudio,
      pain_points: (estudio.pain_points as string[]) || [],
      modulos_recomendados: [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])],
      mrr_estimado: estudio.mrr_estimado || null,
      tpv: (estudio.tpv_actual as string) || lead.tpv || null,
      estado_pipeline: emailFinal ? 'esperando_ok' : 'sin_email',
      research_at: new Date().toISOString(),
      eventos: [...ev, {
        tipo: '🔍',
        texto: `Research OK. Puntuación: ${estudio.puntuacion_lead}/100. MRR: ${estudio.mrr_estimado}€. Email: ${emailFinal || '⚠️ NO ENCONTRADO'}`,
        fecha: new Date().toISOString().split('T')[0]
      }]
    }).eq('id', lead_id)

    // 6. Mensaje Telegram
    const painStr = ((estudio.pain_points as string[]) || []).slice(0, 2).map((p: string) => `• ${p}`).join('\n')
    const mods = [...((estudio.modulos_criticos as string[]) || []), ...((estudio.modulos_secundarios as string[]) || [])].slice(0, 4).join(' · ')
    const emailLinea = emailFinal
      ? `📧 ${emailFinal}`
      : `⚠️ <b>Sin email</b> — añádelo para continuar`

    const text = [
      `🎯 <b>Nuevo lead estudiado</b>`,
      ``,
      `<b>${esc(empresa)}</b>`,
      esc(estudio.resumen_negocio as string || ''), ``,
      `💡 <i>${esc(estudio.argumento_principal as string || '')}</i>`, ``,
      `📦 ${esc(mods)}`,
      `💰 ${estudio.mrr_estimado}€/mes · ⭐ ${estudio.puntuacion_lead}/100`,
      ``,
      `❗ <b>Pain points:</b>`,
      esc(painStr),
      ``,
      emailLinea,
      ``,
      emailFinal ? `¿Genero propuesta y email?` : `Consigue el email y añádelo en /super para continuar.`,
    ].join('\n')

    const inline_keyboard = emailFinal
      ? [
          [{ text: '✅ Sí, generar propuesta', callback_data: `propuesta_ok:${lead_id}` }, { text: '❌ Descartar', callback_data: `propuesta_no:${lead_id}` }],
          [{ text: '✏️ Cambiar foco', callback_data: `propuesta_foco:${lead_id}` }],
        ]
      : [
          [{ text: '❌ Descartar', callback_data: `propuesta_no:${lead_id}` }],
        ]

    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'HTML', reply_markup: { inline_keyboard } })
    })

    return new Response(JSON.stringify({ ok: true, email: emailFinal || null }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    console.error('[lead-research]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

async function callNIM(apiKey: string, system: string, user: string, max = 1000): Promise<string> {
  const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'meta/llama-3.3-70b-instruct', max_tokens: max, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  })
  if (!r.ok) throw new Error(`NIM ${r.status}`)
  const d = await r.json()
  return d.choices?.[0]?.message?.content || ''
}

function esc(s: string): string { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
