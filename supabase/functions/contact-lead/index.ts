import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { nombre, restaurante, telefono } = await req.json()

    if (!nombre || !restaurante || !telefono) {
      return new Response(JSON.stringify({ error: 'Faltan campos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Guardar en Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    const { error: dbError } = await supabase.from('leads').insert({ nombre, restaurante, telefono })
    if (dbError) console.error('DB error:', dbError.message)

    const texto = `🍽️ Nuevo lead ia.rest\n👤 ${nombre}\n🏪 ${restaurante}\n📞 ${telefono}`

    // 2. Email via Resend
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

    // 3. WhatsApp via CallMeBot
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
