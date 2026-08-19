import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { email } = await req.json()
    if (!email || !/\S+@\S+\.\S+/.test(email)) throw new Error('Email no válido')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'iarest' } }
    )

    // Buscar camarero owner con ese email
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('id, nombre, email')
      .eq('email', email)
      .single()

    // Respuesta siempre positiva por seguridad (no revelar si existe la cuenta)
    if (!perfil) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Buscar restaurante y PIN del owner
    const { data: camarero } = await supabase
      .from('camareros')
      .select('pin, nombre, restaurante_id, restaurantes(nombre, codigo_acceso)')
      .eq('rol', 'owner')
      .eq('nombre', perfil.nombre)
      .single()

    if (!camarero) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const restaurante = camarero.restaurantes as any
    const appUrl = Deno.env.get('APP_URL') ?? 'https://ia-rest.vercel.app'
    const resendKey = Deno.env.get('RESEND_API_KEY')

    if (resendKey) {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;background:#14110E;color:#F6F1E7;padding:40px 20px;">
        <div style="max-width:480px;margin:0 auto;">
          <h1 style="font-style:italic;font-size:28px;color:#F6F1E7;margin:0 0 8px">ia<span style="color:#D9442B">.</span>rest</h1>
          <p style="color:#8D8270;font-size:13px;margin:0 0 28px">Recuperaci&oacute;n de acceso</p>
          <p style="font-size:15px;margin:0 0 24px">Hola <strong>${camarero.nombre}</strong>, aqu&iacute; tienes tus datos de acceso.</p>
          <div style="background:#1F1A15;border:1px solid #2F2820;border-radius:12px;padding:24px;margin-bottom:24px">
            <div style="margin-bottom:16px">
              <div style="font-size:11px;color:#8D8270;margin-bottom:4px">RESTAURANTE</div>
              <div style="font-size:18px;font-weight:700">${restaurante?.nombre ?? ''}</div>
            </div>
            <div style="margin-bottom:16px">
              <div style="font-size:11px;color:#8D8270;margin-bottom:4px">C&Oacute;DIGO DE ACCESO</div>
              <div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:.12em">${restaurante?.codigo_acceso ?? ''}</div>
            </div>
            <div style="background:#2d1f0a;border:1px solid #A8761A;border-radius:8px;padding:16px">
              <div style="font-size:11px;color:#A8761A;font-weight:700;margin-bottom:8px">TU PIN</div>
              <div style="font-family:monospace;font-size:36px;font-weight:700;letter-spacing:.2em">${camarero.pin}</div>
            </div>
          </div>
          <a href="${appUrl}/login?r=${restaurante?.codigo_acceso ?? ''}" style="display:block;background:#D9442B;color:#fff;text-decoration:none;text-align:center;padding:16px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:20px">Entrar a mi restaurante &rarr;</a>
          <p style="font-size:12px;color:#8D8270;">Si no solicitaste este email, ignora este mensaje.</p>
        </div>
      </body></html>`

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ia.rest <onboarding@resend.dev>',
          to: [email],
          subject: 'ia.rest — Tus datos de acceso',
          html,
        }),
      }).catch(e => console.error('[recuperar-pin] Resend error:', e))
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
