// qr-split v1 — División de cuenta QR
// POST { action, sesion_id, ...params }
//
// actions:
//   get_items          → devuelve todos los items de la sesión con estado reclamado
//   init_igual         → inicia división igual entre N personas
//   init_por_items     → inicia división por items (devuelve items disponibles)
//   claim_items        → persona reclama sus items y crea su slot
//   pay_slot           → crea Stripe Checkout para un slot
//   slot_status        → estado de todos los slots de la sesión

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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json()
    const { action, sesion_id } = body

    // ── HELPERS ─────────────────────────────────────────────
    const getSesion = async () => {
      const { data } = await sb.from('qr_sesiones_cliente')
        .select('*, restaurantes(nombre, stripe_connect_account_id, stripe_connect_onboarded)')
        .eq('id', sesion_id).single()
      return data
    }

    const getItemsSesion = async () => {
      // Todos los comanda_items de comandas QR de esta sesión
      const sesion = await getSesion()
      const { data: items } = await sb
        .from('comanda_items')
        .select('id, cantidad, precio_unitario, notas, productos(nombre, emoji)')
        .eq('comandas.local_id', sesion.local_id)
        .eq('comandas.mesa_id', sesion.mesa_id)
        .eq('comandas.origen', 'qr_cliente')
      return items || []
    }

    const getTotalSesion = async () => {
      const items = await getItemsSesion()
      const sub = items.reduce((a: number, i: any) => a + i.precio_unitario * i.cantidad, 0)
      return { subtotal: sub, iva: sub * 0.10, total: sub * 1.10 }
    }

    // ── GET_ITEMS ────────────────────────────────────────────
    if (action === 'get_items') {
      const items = await getItemsSesion()
      const { data: reclamados } = await sb.from('qr_items_reclamados')
        .select('comanda_item_id, slot_id').eq('sesion_id', sesion_id)
      const reclamadosSet = new Set((reclamados || []).map((r: any) => r.comanda_item_id))
      return ok({ items: items.map((i: any) => ({ ...i, reclamado: reclamadosSet.has(i.id) })) })
    }

    // ── INIT IGUAL ───────────────────────────────────────────
    if (action === 'init_igual') {
      const { personas } = body
      if (!personas || personas < 2) return err('mínimo 2 personas')
      const { total } = await getTotalSesion()
      const parte = Math.round((total / personas) * 100) / 100

      await sb.from('qr_sesiones_cliente')
        .update({ division_modo: 'igual', division_personas: personas }).eq('id', sesion_id)

      return ok({ modo: 'igual', personas, parte_por_persona: parte, total })
    }

    // ── INIT POR ITEMS ───────────────────────────────────────
    if (action === 'init_por_items') {
      const items = await getItemsSesion()
      await sb.from('qr_sesiones_cliente')
        .update({ division_modo: 'por_items' }).eq('id', sesion_id)
      return ok({ modo: 'por_items', items_disponibles: items })
    }

    // ── CLAIM ITEMS (modo por_items) ─────────────────────────
    if (action === 'claim_items') {
      const { item_ids, propina_pct = 0 } = body
      if (!item_ids?.length) return err('sin items seleccionados')

      const items = await getItemsSesion()
      const seleccionados = items.filter((i: any) => item_ids.includes(i.id))
      const sub = seleccionados.reduce((a: number, i: any) => a + i.precio_unitario * i.cantidad, 0)
      const total = sub * 1.10
      const propina = propina_pct > 0 ? total * propina_pct / 100 : 0

      // Contar personas ya registradas
      const { data: slotsExistentes } = await sb.from('qr_division_slots')
        .select('persona_num').eq('sesion_id', sesion_id).order('persona_num')
      const personaNum = (slotsExistentes?.length || 0) + 1

      const { data: slot } = await sb.from('qr_division_slots').insert({
        sesion_id, local_id: (await getSesion()).local_id,
        persona_num: personaNum, modo: 'por_items',
        item_ids, importe: total + propina, propina_amt: propina
      }).select('id').single()

      // Marcar items como reclamados
      await sb.from('qr_items_reclamados').insert(
        item_ids.map((iid: string) => ({ sesion_id, comanda_item_id: iid, slot_id: slot!.id }))
      )

      return ok({ slot_id: slot!.id, persona_num: personaNum, importe: total + propina })
    }

    // ── PAY SLOT (igual o por_items) ─────────────────────────
    if (action === 'pay_slot') {
      const { modo, personas, propina_pct = 0, slot_id, success_url, cancel_url } = body
      const sesion = await getSesion()
      if (!sesion.restaurantes?.stripe_connect_onboarded) return err('Pagos QR no configurados')

      let importe = 0
      let slotDbId = slot_id

      if (modo === 'igual') {
        const { total } = await getTotalSesion()
        const parte = total / personas
        const propina = propina_pct > 0 ? parte * propina_pct / 100 : 0
        importe = parte + propina

        // Crear slot para esta persona si no existe
        const { data: slotsExistentes } = await sb.from('qr_division_slots')
          .select('id, persona_num').eq('sesion_id', sesion_id).order('persona_num')
        const personaNum = (slotsExistentes?.length || 0) + 1

        const { data: nuevoSlot } = await sb.from('qr_division_slots').insert({
          sesion_id, local_id: sesion.local_id,
          persona_num: personaNum, modo: 'igual',
          importe, propina_amt: propina
        }).select('id').single()
        slotDbId = nuevoSlot!.id
      } else {
        // por_items: importe ya calculado en claim_items
        const { data: slotData } = await sb.from('qr_division_slots').select('importe').eq('id', slot_id).single()
        importe = slotData!.importe
      }

      const appFee = Math.round(importe * 0.005 * 100)
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(importe * 100),
            product_data: { name: `Parte de cuenta — ${sesion.restaurantes.nombre}` },
          },
          quantity: 1,
        }],
        success_url: success_url || `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/q/success?slot=${slotDbId}`,
        cancel_url: cancel_url || `${Deno.env.get('NEXT_PUBLIC_APP_URL')}/q/split?sesion=${sesion_id}`,
        metadata: { sesion_id, slot_id: slotDbId, restaurante_id: sesion.local_id },
        payment_intent_data: {
          application_fee_amount: appFee,
          transfer_data: { destination: sesion.restaurantes.stripe_connect_account_id },
        },
      })

      await sb.from('qr_division_slots')
        .update({ checkout_session_id: checkoutSession.id }).eq('id', slotDbId)

      return ok({ checkout_url: checkoutSession.url, slot_id: slotDbId, importe })
    }

    // ── SLOT STATUS ──────────────────────────────────────────
    if (action === 'slot_status') {
      const { data: slots } = await sb.from('qr_division_slots')
        .select('id, persona_num, modo, importe, pagado, pagado_en, item_ids')
        .eq('sesion_id', sesion_id).order('persona_num')
      const { total } = await getTotalSesion()
      const totalPagado = (slots || []).filter((s: any) => s.pagado).reduce((a: number, s: any) => a + s.importe, 0)
      const { data: itemsReclamados } = await sb.from('qr_items_reclamados')
        .select('comanda_item_id').eq('sesion_id', sesion_id)
      const items = await getItemsSesion()
      const reclamadosSet = new Set((itemsReclamados || []).map((r: any) => r.comanda_item_id))
      const itemsLibres = items.filter((i: any) => !reclamadosSet.has(i.id))

      return ok({ slots: slots || [], total, total_pagado: totalPagado, pendiente: total - totalPagado, items_libres: itemsLibres.length })
    }

    return err('action no reconocida')

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})

const ok  = (d: object) => new Response(JSON.stringify({ ok: true, ...d }), { headers: { 'Access-Control-Allow-Origin':'*', 'Content-Type': 'application/json' } })
const err = (e: string, status = 400) => new Response(JSON.stringify({ error: e }), { status, headers: { 'Access-Control-Allow-Origin':'*', 'Content-Type': 'application/json' } })
