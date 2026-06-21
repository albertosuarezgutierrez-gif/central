export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { firmarObjeto } from '@/lib/session-sign'
import { createServerClient } from '@/lib/supabase'

function sc() {
  return createServerClient()
}

export async function POST(req: NextRequest) {
  const { email, pin } = await req.json()
  if (!email || !pin) return NextResponse.json({ error: 'email y pin requeridos' }, { status: 400 })

  const supabase = sc()
  const { data: contable } = await supabase
    .from('contables')
    .select('id, nombre, nombre_asesoria, modulos, activo')
    .eq('email', email.toLowerCase().trim())
    .eq('pin', pin.trim())
    .single()

  if (!contable)      return NextResponse.json({ error: 'Email o PIN incorrectos' }, { status: 401 })
  if (!contable.activo) return NextResponse.json({ error: 'Cuenta desactivada' }, { status: 403 })

  const modulos: string[] = contable.modulos ?? ['contabilidad']
  if (!modulos.includes('almacen')) {
    return NextResponse.json({ error: 'Esta cuenta no tiene acceso al módulo de almacén.' }, { status: 403 })
  }

  // Restaurantes con acceso a almacén
  const { data: accesos } = await supabase
    .from('contable_clientes')
    .select('local_id, permisos, restaurantes(id, nombre, ciudad, cuenta_id)')
    .eq('contable_id', contable.id)
    .eq('activo', true)
    .contains('modulos', ['almacen'])

  await supabase.from('contables').update({ ultimo_acceso: new Date().toISOString() }).eq('id', contable.id)

  const restaurantes = (accesos ?? []).map(a => ({
    id:       (a.restaurantes as unknown as { id: string; nombre: string; ciudad?: string; cuenta_id?: string })?.id,
    nombre:   (a.restaurantes as unknown as { nombre: string })?.nombre,
    ciudad:   (a.restaurantes as unknown as { ciudad?: string })?.ciudad,
    cuenta_id:(a.restaurantes as unknown as { cuenta_id?: string })?.cuenta_id,
    permisos: a.permisos ?? ['ver_stock', 'ver_pedidos', 'crear_pedido'],
  })).filter(r => r.id)

  return NextResponse.json({
    ok: true,
    session: firmarObjeto({ contable_id: contable.id, nombre: contable.nombre, nombre_empresa: contable.nombre_asesoria ?? null, email: email.toLowerCase().trim(), restaurantes, modulos }),
  })
}
