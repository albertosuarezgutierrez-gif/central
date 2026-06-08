export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import Stripe from 'stripe'

function getStripeKey(): string {
  const mode = process.env.STRIPE_MODE ?? 'test'
  return mode === 'live'
    ? process.env.STRIPE_SECRET_KEY!
    : process.env.STRIPE_SECRET_KEY_TEST!
}

/**
 * POST /api/owner/proveedores/stripe-onboard
 * Body: { proveedor_id: string, accion: "crear_cuenta" | "pagar" | "estado" }
 *
 * accion=crear_cuenta → genera link de onboarding Stripe Connect para el proveedor
 * accion=pagar        → ejecuta transfer a la cuenta conectada del proveedor
 * accion=estado       → verifica estado de la cuenta Connect
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { proveedor_id, accion, orden_id, return_url } = await req.json()
  if (!proveedor_id || !accion) return NextResponse.json({ error: 'proveedor_id y accion requeridos' }, { status: 400 })

  const stripe = new Stripe(getStripeKey(), { apiVersion: '2023-10-16' as never })

  // Cargar proveedor
  const { data: prov } = await supabase
    .from('proveedores')
    .select('id, nombre, email, stripe_account_id, stripe_onboarded')
    .eq('id', proveedor_id)
    .eq('local_id', rid)
    .single()

  if (!prov) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })

  // ── CREAR CUENTA CONNECT ──────────────────────────────────────────────────
  if (accion === 'crear_cuenta') {
    let accountId = prov.stripe_account_id

    if (!accountId) {
      // Crear Express account para el proveedor
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'ES',
        email: prov.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        business_type: 'company',
        metadata: { proveedor_id, local_id: rid, proveedor_nombre: prov.nombre },
      })
      accountId = account.id
      await supabase.from('proveedores').update({ stripe_account_id: accountId }).eq('id', proveedor_id)
    }

    // Generar link de onboarding
    const base = return_url ?? 'https://www.iarest.es/owner'
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${base}?stripe_refresh=1`,
      return_url:  `${base}?stripe_onboard=ok&proveedor=${proveedor_id}`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ ok: true, onboarding_url: link.url, account_id: accountId })
  }

  // ── VERIFICAR ESTADO ──────────────────────────────────────────────────────
  if (accion === 'estado') {
    if (!prov.stripe_account_id) return NextResponse.json({ ok: true, onboarded: false })
    const account = await stripe.accounts.retrieve(prov.stripe_account_id)
    const onboarded = account.charges_enabled && account.payouts_enabled
    if (onboarded && !prov.stripe_onboarded) {
      await supabase.from('proveedores').update({ stripe_onboarded: true }).eq('id', proveedor_id)
    }
    return NextResponse.json({
      ok: true,
      onboarded,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      account_id: prov.stripe_account_id,
    })
  }

  // ── EJECUTAR PAGO ─────────────────────────────────────────────────────────
  if (accion === 'pagar') {
    if (!orden_id) return NextResponse.json({ error: 'orden_id requerido' }, { status: 400 })
    if (!prov.stripe_account_id || !prov.stripe_onboarded) {
      return NextResponse.json({ error: 'El proveedor no ha completado el onboarding de Stripe' }, { status: 422 })
    }

    const { data: orden } = await supabase
      .from('ordenes_pago_proveedor')
      .select('id, importe, concepto, estado')
      .eq('id', orden_id)
      .eq('local_id', rid)
      .single()

    if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
    if (orden.estado !== 'aprobado') return NextResponse.json({ error: 'La orden debe estar aprobada' }, { status: 422 })

    // Transfer instantáneo a la cuenta Connect del proveedor
    const transfer = await stripe.transfers.create({
      amount: Math.round(Number(orden.importe) * 100), // en céntimos
      currency: 'eur',
      destination: prov.stripe_account_id,
      description: orden.concepto,
      metadata: { orden_id, proveedor_id, local_id: rid },
    })

    await supabase.from('ordenes_pago_proveedor').update({
      estado: 'pagado_stripe',
      stripe_transfer_id: transfer.id,
      pagado_at: new Date().toISOString(),
    }).eq('id', orden_id)

    return NextResponse.json({
      ok: true,
      transfer_id: transfer.id,
      importe: Number(orden.importe),
      proveedor: prov.nombre,
    })
  }

  return NextResponse.json({ error: 'accion desconocida' }, { status: 400 })
}
