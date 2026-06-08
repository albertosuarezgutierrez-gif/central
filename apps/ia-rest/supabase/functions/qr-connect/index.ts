// qr-connect v1 — Gestión Stripe Connect para el owner
// GET  ?restaurante_id=xxx           → estado de conexión
// POST { restaurante_id, action }
//   action=create_link  → OAuth link para conectar cuenta
//   action=dashboard    → link al dashboard Stripe del restaurante
//   action=disconnect   → desconectar cuenta

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const rid = url.searchParams.get('restaurante_id')
      const { data: rest } = await supabase
        .from('restaurantes')
        .select('stripe_connect_account_id, stripe_connect_onboarded')
        .eq('id', rid).single()
      return new Response(JSON.stringify({ conectado: !!rest?.stripe_connect_onboarded, account_id: rest?.stripe_connect_account_id }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { restaurante_id, action, code } = await req.json()

    // ── COMPLETAR OAUTH (callback con code) ──────────────────
    if (action === 'oauth_callback' && code) {
      const response = await stripe.oauth.token({ grant_type: 'authorization_code', code })
      const accountId = response.stripe_user_id!

      await supabase
        .from('restaurantes')
        .update({ stripe_connect_account_id: accountId, stripe_connect_onboarded: true })
        .eq('id', restaurante_id)

      return new Response(JSON.stringify({ ok: true, account_id: accountId }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── CREAR LINK OAUTH ─────────────────────────────────────
    if (action === 'create_link') {
      const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://www.iarest.es'
      const oauthUrl = stripe.oauth.authorizeUrl({
        response_type: 'code',
        scope: 'read_write',
        redirect_uri: `${appUrl}/api/qr/connect/callback`,
        state: restaurante_id,
      })
      return new Response(JSON.stringify({ ok: true, url: oauthUrl }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── DASHBOARD LINK ───────────────────────────────────────
    if (action === 'dashboard') {
      const { data: rest } = await supabase
        .from('restaurantes').select('stripe_connect_account_id').eq('id', restaurante_id).single()
      if (!rest?.stripe_connect_account_id) throw new Error('No conectado')
      const link = await stripe.accounts.createLoginLink(rest.stripe_connect_account_id)
      return new Response(JSON.stringify({ ok: true, url: link.url }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    // ── DESCONECTAR ──────────────────────────────────────────
    if (action === 'disconnect') {
      const { data: rest } = await supabase
        .from('restaurantes').select('stripe_connect_account_id').eq('id', restaurante_id).single()
      if (rest?.stripe_connect_account_id) {
        await stripe.oauth.deauthorize({ client_id: Deno.env.get('STRIPE_CLIENT_ID')!, stripe_user_id: rest.stripe_connect_account_id })
      }
      await supabase
        .from('restaurantes')
        .update({ stripe_connect_account_id: null, stripe_connect_onboarded: false })
        .eq('id', restaurante_id)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'action no reconocida' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
