// ============================================================
// ia.rest · POST /api/comanda/[id]/pedir-cuenta
// ============================================================
// Marca la comanda como "cuenta_pedida" e imprime el ticket
// de cuenta en la impresora de caja configurada.
//
// · NO requiere body (solo session + restaurante_id del header)
// · Retorna { ok, impresora_nombre?, sin_impresora? }
//
// Lógica de impresora:
//   1. Busca impresoras con es_caja=true del restaurante
//   2. Si hay varias, prefiere la de la zona de la mesa
//   3. Si no hay es_caja, usa la primera impresora activa
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { crearPrintJobCuenta } from '@/lib/courier'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: comanda_id } = await params
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)

  if (!comanda_id) {
    return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })
  }

  // ── 1. Verificar comanda ──────────────────────────────────
  const { data: comanda, error: errComanda } = await supabase
    .from('comandas')
    .select(`
      id, estado, restaurante_id, mesa_id, numero_ticket,
      camarero_id,
      items:comanda_items(nombre, cantidad, precio_unitario),
      mesa:mesas(codigo, zona_id, zona:zonas(id, nombre, tipo))
    `)
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (errComanda || !comanda) {
    return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  }

  if (comanda.estado === 'cerrada') {
    return NextResponse.json({ error: 'La comanda ya está cerrada' }, { status: 409 })
  }

  if (comanda.estado === 'cuenta_pedida') {
    // Idempotente: si ya está en cuenta_pedida, devuelve ok (puede re-imprimir)
    // Continuamos para re-imprimir el ticket
  }

  // ── 2. Actualizar estado a cuenta_pedida ──────────────────
  const { error: errUpdate } = await supabase
    .from('comandas')
    .update({ estado: 'cuenta_pedida' })
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)

  if (errUpdate) {
    console.error('[PEDIR-CUENTA] Error update:', errUpdate)
    return NextResponse.json({ error: 'Error actualizando estado' }, { status: 500 })
  }

  // Actualizar también estado de la mesa
  if (comanda.mesa_id) {
    await supabase
      .from('mesas')
      .update({ estado: 'cuenta' })
      .eq('id', comanda.mesa_id)
      .eq('restaurante_id', restaurante_id)
  }

  // ── 3. Datos para el ticket ───────────────────────────────
  type RawItem = { nombre: string; cantidad: number; precio_unitario: number | null }
  const items = (comanda.items as RawItem[]) ?? []

  // Enriquecer precios si faltan
  const sinPrecio = items.filter(it => it.precio_unitario == null)
  if (sinPrecio.length > 0) {
    const nombres = [...new Set(sinPrecio.map(i => i.nombre))]
    const { data: prods } = await supabase
      .from('productos').select('nombre, precio')
      .in('nombre', nombres).eq('restaurante_id', restaurante_id)
    const map: Record<string, number> = {}
    for (const p of prods ?? []) if (p.precio) map[p.nombre] = Number(p.precio)
    for (const it of items) {
      if (it.precio_unitario == null && map[it.nombre]) {
        it.precio_unitario = map[it.nombre]
      }
    }
  }

  const total = items.reduce((s, it) => s + (it.precio_unitario ?? 0) * it.cantidad, 0)

  // Datos del restaurante para el pie del ticket
  const { data: rest } = await supabase
    .from('restaurantes').select('nombre, direccion').eq('id', restaurante_id).single()

  // Mesa info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mesa = (comanda.mesa as any) as { codigo: string; zona_id?: string | null; zona?: { id: string; nombre: string; tipo: string } | null } | null
  const mesa_label = mesa?.codigo ?? 'Mesa'
  const zona_tipo  = (mesa?.zona as { tipo?: string } | null)?.tipo ?? null
  const zona_nombre = (mesa?.zona as { nombre?: string } | null)?.nombre ?? null

  // Camarero nombre
  let camarero_nombre = session?.nombre ?? 'Equipo'
  if (!session?.nombre) {
    const { data: cam } = await supabase
      .from('camareros').select('nombre').eq('id', comanda.camarero_id).single()
    camarero_nombre = cam?.nombre ?? 'Equipo'
  }

  // ── 4. Crear print_job del ticket de cuenta ───────────────
  let impresora_nombre: string | null = null
  let sin_impresora = false

  try {
    const result = await crearPrintJobCuenta({
      comanda_id,
      restaurante_id,
      mesa_label,
      zona_tipo,
      zona_nombre,
      camarero_nombre,
      numero_ticket: comanda.numero_ticket ?? 0,
      restaurante_nombre: rest?.nombre ?? 'Restaurante',
      restaurante_direccion: rest?.direccion ?? null,
      items: items.map(it => ({
        nombre:          it.nombre,
        cantidad:        it.cantidad,
        precio_unitario: it.precio_unitario ?? 0,
      })),
      total: Math.round(total * 100) / 100,
    })

    impresora_nombre = result?.impresora_nombre ?? null
    sin_impresora = !result?.job_id
  } catch (e) {
    console.error('[PEDIR-CUENTA] Error print:', e)
    sin_impresora = true
  }

  console.log(`[PEDIR-CUENTA] ✓ Comanda ${comanda_id} → cuenta_pedida · impresora: ${impresora_nombre ?? 'ninguna'}`)

  return NextResponse.json({
    ok: true,
    impresora_nombre,
    sin_impresora,
    mesa_label,
    total: Math.round(total * 100) / 100,
  })
}
