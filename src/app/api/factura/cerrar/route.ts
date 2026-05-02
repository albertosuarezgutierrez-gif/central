// ============================================================
// POST /api/factura/cerrar
// Cierra una comanda y genera su factura Verifactu
// Body: { comanda_id: string, mesa_label?: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { construirFactura } from '@/lib/verifactu'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)

  // ── 1. Parsear body ──────────────────────────────────────
  let body: { comanda_id: string; mesa_label?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  const { comanda_id, mesa_label = 'Mesa' } = body
  if (!comanda_id) {
    return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })
  }

  // ── 2. Verificar que la comanda existe y pertenece al restaurante ──
  const { data: comanda, error: errComanda } = await supabase
    .from('comandas')
    .select('id, estado, restaurante_id')
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (errComanda || !comanda) {
    return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  }
  if (comanda.estado === 'cerrada') {
    // Devolver la factura ya generada
    const { data: factExist } = await supabase
      .from('facturas_verifactu')
      .select('*')
      .eq('comanda_id', comanda_id)
      .single()
    if (factExist) return NextResponse.json({ factura: factExist, ya_existia: true })
  }

  // ── 3. Calcular importe total desde comanda_items ────────
  const { data: items, error: errItems } = await supabase
    .from('comanda_items')
    .select('precio_unitario, cantidad, nombre')
    .eq('comanda_id', comanda_id)
    .eq('restaurante_id', restaurante_id)

  if (errItems || !items?.length) {
    return NextResponse.json(
      { error: 'Comanda sin items — no se puede facturar' },
      { status: 422 }
    )
  }

  const importe_total = items.reduce(
    (sum, it) => sum + (it.precio_unitario ?? 0) * (it.cantidad ?? 1),
    0
  )
  if (importe_total <= 0) {
    return NextResponse.json(
      { error: 'Importe total 0 — revisa precios en la carta' },
      { status: 422 }
    )
  }

  // ── 4. Obtener datos fiscales del restaurante ────────────
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nif, razon_social, nombre')
    .eq('id', restaurante_id)
    .single()

  const nif_emisor   = rest?.nif         ?? 'B00000000'
  const razon_social = rest?.razon_social ?? rest?.nombre ?? 'Restaurante'

  // ── 5. Siguiente número + última huella (función atómica) ─
  const { data: secRows, error: errSec } = await supabase
    .rpc('siguiente_numero_factura', {
      p_restaurante_id: restaurante_id,
      p_serie: 'T',
    })

  if (errSec) {
    console.error('[factura/cerrar] RPC error:', errSec)
    return NextResponse.json({ error: 'Error al numerar factura' }, { status: 500 })
  }

  const { numero, huella_ant, es_primera } = secRows[0] as {
    numero: number
    huella_ant: string | null
    es_primera: boolean
  }

  // ── 6. Construir factura con hash encadenado ─────────────
  const facturaData = construirFactura({
    nif_emisor,
    razon_social,
    numero_serie:    'T',
    numero_factura:  numero,
    huella_anterior: huella_ant,
    primer_registro: es_primera,
    comanda_id,
    mesa_label,
    num_items:       items.length,
    importe_total:   Math.round(importe_total * 100) / 100,
  })

  // ── 7. Insertar factura ───────────────────────────────────
  const { data: factura, error: errInsert } = await supabase
    .from('facturas_verifactu')
    .insert({ restaurante_id, ...facturaData })
    .select()
    .single()

  if (errInsert) {
    console.error('[factura/cerrar] Insert error:', errInsert)
    return NextResponse.json({ error: 'Error al guardar factura' }, { status: 500 })
  }

  // ── 8. Marcar comanda como cerrada ───────────────────────
  await supabase
    .from('comandas')
    .update({ estado: 'cerrada' })
    .eq('id', comanda_id)

  return NextResponse.json({ factura, ya_existia: false }, { status: 201 })
}
