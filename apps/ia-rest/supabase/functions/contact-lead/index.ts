import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// contact-lead v5 — trazabilidad RGPD (art. 7 + art. 5.2)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Anonimiza IP: pone a 0 el último octeto IPv4 */
function anonimizarIp(ip: string | null): string | null {
  if (!ip) return null
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/)
  if (v4) return `${v4[1]}.0`
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { nombre, restaurante, telefono, email, consent_rgpd } = body

    if (!nombre || !restaurante || !telefono) {
      return new Response(JSON.stringify({ error: 'Faltan campos obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validación de consentimiento server-side
    if (consent_rgpd !== true) {
      return new Response(JSON.stringify({ error: 'Se requiere consentimiento RGPD para procesar la solicitud' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? null
    const consent_ip = anonimizarIp(rawIp)
    const consent_at = new Date().toISOString()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error: dbError } = await supabase.from('leads').insert({
      nombre,
      restaurante,
      telefono,
      email: email || null,
      consent_rgpd: true,
      consent_at,
      consent_ip,
    })
    if (dbError) console.error('DB error:', dbError.message)

    const texto = `🍽️ Nuevo lead ia.rest\n👤 ${nombre}\n🏪 ${restaurante}\n📞 ${telefono}\n✉️ ${email || 'sin email'}\n✅ Consentimiento RGPD: SÍ · ${consent_at}`

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ia.rest <onboarding@resend.dev>',
          to: ['alberto.suarez.gutierrez@gmail.com'],
          subject: `🍽️ Nuevo lead: ${restaurante}`,
          text: texto,
          html: `<pre style="font-family:monospace;font-size:15px;line-height:1.7">${texto}</pre>`,
        }),
      }).catch(e => console.error('Resend error:', e))
    }

    const cbPhone = Deno.env.get('CALLMEBOT_PHONE')
    const cbKey = Deno.env.get('CALLMEBOT_APIKEY')
    if (cbPhone && cbKey) {
      const msg = encodeURIComponent(texto)
      await fetch(`https://api.callmebot.com/whatsapp.php?phone=${cbPhone}&text=${msg}&apikey=${cbKey}`)
        .catch(e => console.error('CallMeBot error:', e))
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('contact-lead error:', error)
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
