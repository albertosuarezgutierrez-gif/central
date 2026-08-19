import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STRIPE_MODE = Deno.env.get('STRIPE_MODE') ?? 'test'
const IS_TEST = STRIPE_MODE.toLowerCase() !== 'live'
console.log(`[auth-register v24] STRIPE_MODE='${STRIPE_MODE}' IS_TEST=${IS_TEST}`)

function getStripeConfig() {
  const secretKey = IS_TEST ? Deno.env.get('STRIPE_SECRET_KEY_TEST')! : Deno.env.get('STRIPE_SECRET_KEY')!
  return {
    secretKey,
    priceBase:    IS_TEST ? Deno.env.get('STRIPE_PRICE_BASE_TEST')!    : 'price_1TUKYVK5xixGkeRIEGTKlZFp',
    priceExtra20: IS_TEST ? Deno.env.get('STRIPE_PRICE_EXTRA_20_TEST')! : 'price_1TUKYVK5xixGkeRIL33AA4Ef',
    priceExtra15: IS_TEST ? Deno.env.get('STRIPE_PRICE_EXTRA_15_TEST')! : 'price_1TUKYVK5xixGkeRIMbs7zJ2j',
  }
}

const PINES_PROHIBIDOS = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','2121','0001','1000','1230','0123','2345','3456','9876','5678','2026'])
function generarPinSeguro(): string {
  let pin: string
  do { pin = String(Math.floor(1000 + Math.random() * 9000)) } while (PINES_PROHIBIDOS.has(pin))
  return pin
}

function buildLineItems(n: number, cfg: ReturnType<typeof getStripeConfig>) {
  const items: { price: string; quantity: number }[] = [{ price: cfg.priceBase, quantity: 1 }]
  if (n <= 1) return items
  if (n <= 6) { items.push({ price: cfg.priceExtra20, quantity: n - 1 }) }
  else { items.push({ price: cfg.priceExtra20, quantity: 5 }); items.push({ price: cfg.priceExtra15, quantity: n - 6 }) }
  return items
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)
}
function toCodigo(nombre: string) {
  const base = nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Z0-9]/g,'').slice(0,5)
  return (base + String(Math.floor(100 + Math.random() * 900))).slice(0,8)
}

async function enviarEmailBienvenida(opts: {
  email: string; nombre: string; nombre_restaurante: string
  codigo_acceso: string; pin_owner: string; app_url: string
}) {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return

  const loginUrl = `${opts.app_url}/login?r=${opts.codigo_acceso}`
  const contratoUrl = `${opts.app_url}/contrato-iarest-v1.pdf`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bienvenido a ia.rest</title>
</head>
<body style="margin:0;padding:0;background:#F0EBE1;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0EBE1;padding:40px 16px;">
<tr><td align="center">

<!-- Card -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFDF9;border-radius:16px;overflow:hidden;box-shadow:0 2px 24px rgba(0,0,0,0.08);">

  <!-- Header negro con logo -->
  <tr>
    <td style="background:#14110E;padding:36px 40px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <div style="font-size:28px;font-weight:700;color:#F6F1E7;letter-spacing:-0.5px;font-style:italic;">ia<span style="color:#D9442B;">.</span>rest</div>
            <div style="font-size:12px;color:#6B5F52;margin-top:4px;letter-spacing:0.06em;text-transform:uppercase;">Sistema operativo por voz</div>
          </td>
          <td align="right">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#1F1A15;border-radius:10px;padding:10px 12px;">
                <div style="display:flex;gap:3px;align-items:flex-end;">
                  <div style="width:3px;height:10px;background:#F6F1E7;border-radius:2px;"></div>
                  <div style="width:3px;height:16px;background:#F6F1E7;border-radius:2px;"></div>
                  <div style="width:3px;height:24px;background:#D9442B;border-radius:2px;"></div>
                  <div style="width:3px;height:20px;background:#F6F1E7;border-radius:2px;"></div>
                  <div style="width:3px;height:12px;background:#F6F1E7;border-radius:2px;"></div>
                  <div style="width:3px;height:8px;background:#F6F1E7;border-radius:2px;"></div>
                </div>
              </td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Franja vermilion -->
  <tr><td style="background:#D9442B;padding:14px 40px;">
    <p style="margin:0;font-size:13px;color:#FFFFFF;font-weight:600;letter-spacing:0.04em;">&#127881;&nbsp; TU RESTAURANTE EST&Aacute; LISTO &mdash; 14 D&Iacute;AS GRATIS</p>
  </td></tr>

  <!-- Saludo -->
  <tr><td style="padding:36px 40px 0;">
    <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1714;letter-spacing:-0.3px;">Hola, ${opts.nombre} &#128075;</p>
    <p style="margin:0;font-size:15px;color:#5A4E45;line-height:1.6;">Tu cuenta de <strong>${opts.nombre_restaurante}</strong> est&aacute; activa. Aqu&iacute; tienes todo lo que necesitas para empezar.</p>
  </td></tr>

  <!-- Tarjeta de acceso -->
  <tr><td style="padding:24px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#14110E;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px 28px;">
        <p style="margin:0 0 16px;font-size:10px;color:#6B5F52;letter-spacing:0.12em;text-transform:uppercase;">Tus credenciales de acceso</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:14px;">
              <div style="font-size:10px;color:#6B5F52;letter-spacing:0.1em;margin-bottom:4px;">RESTAURANTE</div>
              <div style="font-size:17px;font-weight:700;color:#F6F1E7;">${opts.nombre_restaurante}</div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:14px;">
              <div style="font-size:10px;color:#6B5F52;letter-spacing:0.1em;margin-bottom:4px;">C&Oacute;DIGO DE ACCESO</div>
              <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:700;color:#F6F1E7;letter-spacing:0.15em;">${opts.codigo_acceso}</div>
            </td>
          </tr>
          <tr>
            <td>
              <div style="background:#2D1F0A;border:1px solid #A8761A;border-radius:8px;padding:16px 20px;">
                <div style="font-size:10px;color:#E8A33B;font-weight:700;letter-spacing:0.1em;margin-bottom:6px;">&#9888;&nbsp; TU PIN DE PROPIETARIO &mdash; CONF&Iacute;DENCIAL</div>
                <div style="font-family:'Courier New',monospace;font-size:38px;font-weight:700;color:#F6F1E7;letter-spacing:0.25em;">${opts.pin_owner}</div>
                <div style="font-size:11px;color:#A8761A;margin-top:6px;">C&aacute;mbialo desde /owner &rarr; Personal cuando quieras</div>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- CTA botón -->
  <tr><td style="padding:28px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${loginUrl}" style="display:inline-block;background:#D9442B;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;padding:16px 40px;border-radius:10px;letter-spacing:-0.2px;">Entrar a mi restaurante &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#9A8D7C;">o copia en tu navegador: <span style="font-family:monospace;color:#D9442B;">${loginUrl}</span></p>
  </td></tr>

  <!-- Separador -->
  <tr><td style="padding:28px 40px 0;"><div style="height:1px;background:#E8DFD0;"></div></td></tr>

  <!-- Pasos rápidos -->
  <tr><td style="padding:28px 40px 0;">
    <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#1A1714;letter-spacing:0.02em;">PRIMEROS PASOS (5 minutos)</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="32" valign="top" style="padding-bottom:14px;">
          <div style="width:24px;height:24px;background:#D9442B;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff;">1</div>
        </td>
        <td style="padding-bottom:14px;padding-left:12px;">
          <div style="font-size:14px;font-weight:600;color:#1A1714;">Configura tu carta</div>
          <div style="font-size:13px;color:#5A4E45;margin-top:2px;">Sube una foto de tu carta en papel &mdash; la IA la lee sola.</div>
        </td>
      </tr>
      <tr>
        <td width="32" valign="top" style="padding-bottom:14px;">
          <div style="width:24px;height:24px;background:#D9442B;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff;">2</div>
        </td>
        <td style="padding-bottom:14px;padding-left:12px;">
          <div style="font-size:14px;font-weight:600;color:#1A1714;">A&ntilde;ade a tu equipo</div>
          <div style="font-size:13px;color:#5A4E45;margin-top:2px;">Crea los perfiles de camareros y cocina con sus PINs.</div>
        </td>
      </tr>
      <tr>
        <td width="32" valign="top">
          <div style="width:24px;height:24px;background:#D9442B;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;color:#fff;">3</div>
        </td>
        <td style="padding-left:12px;">
          <div style="font-size:14px;font-weight:600;color:#1A1714;">Primera comanda por voz</div>
          <div style="font-size:13px;color:#5A4E45;margin-top:2px;">&laquo;Dos ca&ntilde;as y una ensalada a la mesa cuatro&raquo; &mdash; y a correr.</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Separador -->
  <tr><td style="padding:28px 40px 0;"><div style="height:1px;background:#E8DFD0;"></div></td></tr>

  <!-- Bloque contrato -->
  <tr><td style="padding:24px 40px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;border-radius:10px;border:1px solid #DDD5C4;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:11px;font-weight:700;color:#6B5F52;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Tu contrato</div>
        <div style="font-size:13px;color:#3A332C;line-height:1.6;margin-bottom:12px;">
          Copia del Contrato de Prestaci&oacute;n de Servicios SaaS v1.0 que aceptaste al registrarte. Gu&aacute;rdalo para tus registros.
        </div>
        <a href="${contratoUrl}" style="display:inline-block;background:#1A1714;color:#F6F1E7;text-decoration:none;font-size:12px;font-weight:700;padding:10px 18px;border-radius:8px;letter-spacing:-0.1px;">
          Descargar contrato (PDF) &darr;
        </a>
        <div style="margin-top:10px;font-size:11px;color:#9A8D7C;">Tambi&eacute;n disponible en todo momento en /owner &rarr; Suscripci&oacute;n.</div>
      </td></tr>
    </table>
  </td></tr>

  <!-- Separador -->
  <tr><td style="padding:28px 40px 0;"><div style="height:1px;background:#E8DFD0;"></div></td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 40px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <p style="margin:0 0 6px;font-size:13px;color:#5A4E45;">&#128172;&nbsp; ¿Dudas? Escr&iacute;benos por WhatsApp:</p>
          <a href="https://wa.me/34637349990" style="font-size:13px;color:#25D366;font-weight:600;text-decoration:none;">+34 637 349 990</a>
        </td>
        <td align="right" valign="top">
          <p style="margin:0;font-size:11px;color:#B8A98B;line-height:1.6;text-align:right;">14 d&iacute;as gratis.<br>Sin cargo hasta que termine el trial.<br>Cancela cuando quieras.</p>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#C8BBA8;font-style:italic;">hecho con cari&ntilde;o en una cocina &middot; ia-rest.vercel.app</p>
  </td></tr>

</table>
<!-- /Card -->

</td></tr>
</table>
<!-- /Wrapper -->

</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'ia.rest <onboarding@resend.dev>',
      to: [opts.email],
      subject: `Bienvenido a ia.rest — Tu restaurante ${opts.nombre_restaurante} ya está listo`,
      html,
    }),
  })
  const body = await res.json().catch(() => ({}))
  console.log('[auth-register] Resend status:', res.status, JSON.stringify(body))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { nombre, email, telefono, nombre_restaurante, num_usuarios = 1 } = await req.json()
    if (!nombre?.trim()) throw new Error('Nombre obligatorio')
    if (!/\S+@\S+\.\S+/.test(email)) throw new Error('Email no válido')
    if (!nombre_restaurante?.trim()) throw new Error('Nombre del restaurante obligatorio')

    const nU = Math.max(1, Math.floor(Number(num_usuarios)))
    const cfg = getStripeConfig()
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'iarest' } })

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email, phone: telefono?.trim() || undefined, email_confirm: true,
      user_metadata: { nombre, plan: 'trial' },
    })
    if (authError) {
      if (authError.message.includes('already registered')) throw new Error('Este email ya tiene una cuenta. ¿Quieres iniciar sesión?')
      throw authError
    }
    const userId = authData.user.id

    const slug = toSlug(nombre_restaurante)
    let codigo = toCodigo(nombre_restaurante)
    for (let i = 0; i < 5; i++) {
      const { data: ex } = await supabase.from('restaurantes').select('id').eq('codigo_acceso', codigo).single()
      if (!ex) break
      codigo = toCodigo(nombre_restaurante)
    }

    const { data: rest, error: restError } = await supabase
      .from('restaurantes')
      .insert({ nombre: nombre_restaurante, slug, codigo_acceso: codigo, plan: 'per_seat', plan_status: 'trial', max_camareros: nU, max_mesas: 999, max_secciones: 999, trial_start: new Date().toISOString(), trial_end: new Date(Date.now() + 14*24*60*60*1000).toISOString() })
      .select('id, codigo_acceso').single()
    if (restError) throw restError

    await supabase.from('perfiles').upsert({ id: userId, nombre, email, telefono: telefono?.trim() || null, plan: 'per_seat', plan_status: 'trial', trial_start: new Date().toISOString(), trial_end: new Date(Date.now() + 14*24*60*60*1000).toISOString() })

    const pinOwner = generarPinSeguro()
    await supabase.from('camareros').insert({ restaurante_id: rest.id, nombre, pin: pinOwner, rol: 'owner', activo: true })

    const { error: onbError } = await supabase.rpc('onboarding_restaurante', { p_restaurante_id: rest.id })
    if (onbError) console.error('[auth-register] Onboarding:', onbError.message)

    const stripe = new Stripe(cfg.secretKey, { apiVersion: '2023-10-16' })
    const appUrl = Deno.env.get('APP_URL') ?? 'https://ia-rest.vercel.app'

    const customer = await stripe.customers.create({
      email, name: nombre,
      metadata: { supabase_user_id: userId, restaurante_id: rest.id, stripe_mode: IS_TEST ? 'test' : 'live' },
    })
    await supabase.from('perfiles').update({ stripe_customer_id: customer.id }).eq('id', userId)

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: buildLineItems(nU, cfg),
      customer_update: { address: 'auto', name: 'auto' },
      subscription_data: {
        trial_period_days: 14,
        metadata: { supabase_user_id: userId, restaurante_id: rest.id, num_usuarios: String(nU) },
      },
      success_url: `${appUrl}/login?r=${rest.codigo_acceso}&checkout=success`,
      cancel_url: `${appUrl}/registro?checkout=cancelled`,
      billing_address_collection: 'auto',
      automatic_tax: { enabled: true },
      tax_id_collection: { enabled: true },
      locale: 'es',
      metadata: { supabase_user_id: userId, restaurante_id: rest.id, num_usuarios: String(nU), stripe_mode: IS_TEST ? 'test' : 'live' },
      custom_text: {
        submit: {
          message: IS_TEST
            ? 'MODO TEST — Usa la tarjeta 4242 4242 4242 4242 · fecha 12/30 · CVC 123. Sin cargos reales.'
            : 'Activas tu suscripción con 14 días de prueba gratis.',
        },
      },
    })

    await enviarEmailBienvenida({ email, nombre, nombre_restaurante, codigo_acceso: rest.codigo_acceso, pin_owner: pinOwner, app_url: appUrl })

    return new Response(
      JSON.stringify({ success: true, checkout_url: session.url, codigo_acceso: rest.codigo_acceso, restaurante_id: rest.id, pin_owner: pinOwner }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 201 }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
