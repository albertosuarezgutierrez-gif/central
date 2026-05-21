export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/factura/cliente
// Emite una factura completa (serie F) con datos fiscales del cliente
// Vinculada a una comanda ya cerrada (factura_verifactu existente)
// Body: { comanda_id, cliente: { nif, razon_social, direccion?, email? }, motivo? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'

export const runtime = 'nodejs'

// ── Validación NIF/NIE/CIF español ──────────────────────────
function validarNifEspanol(nif: string): boolean {
  const clean = nif.trim().toUpperCase()
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/.test(clean)) return true
  if (/^\d{8}[TRWAGMYFPDXBNJZSQVHLCKET]$/.test(clean)) {
    const letras = 'TRWAGMYFPDXBNJZSQVHLCKET'
    return clean[8] === letras[parseInt(clean.slice(0, 8)) % 23]
  }
  if (/^[XYZ]\d{7}[TRWAGMYFPDXBNJZSQVHLCKET]$/.test(clean)) return true
  return false
}

// ── GET — Comprobar si una comanda ya tiene factura cliente ──
export async function GET(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const comanda_id = req.nextUrl.searchParams.get('comanda_id')

  if (!comanda_id) return NextResponse.json({ factura: null })

  const { data } = await supabase
    .from('facturas_cliente')
    .select('*')
    .eq('comanda_id', comanda_id)
    .eq('restaurante_id', restaurante_id)
    .maybeSingle()

  return NextResponse.json({ factura: data ?? null })
}

// ── POST — Emitir factura completa ───────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)

  // Solo owner y jefe_sala
  if (!session || !['owner', 'jefe_sala'].includes(session.rol)) {
    return NextResponse.json({ error: 'Sin permisos — solo owner o jefe de sala' }, { status: 403 })
  }

  let body: {
    comanda_id: string
    cliente: { nif: string; razon_social: string; direccion?: string; email?: string }
    motivo?: string
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { comanda_id, cliente, motivo } = body

  if (!comanda_id) return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })
  if (!cliente?.nif || !cliente?.razon_social) {
    return NextResponse.json({ error: 'NIF y razón social del cliente requeridos' }, { status: 400 })
  }

  const nifClean = cliente.nif.trim().toUpperCase()
  if (!validarNifEspanol(nifClean)) {
    return NextResponse.json({ error: 'NIF/CIF no válido' }, { status: 422 })
  }

  // ── 1. Verificar comanda cerrada ────────────────────────
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, estado, restaurante_id')
    .eq('id', comanda_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  if (comanda.estado !== 'cerrada') {
    return NextResponse.json({ error: 'La comanda debe estar cerrada para emitir factura' }, { status: 422 })
  }

  // ── 2. Verificar que no existe ya factura cliente para esta comanda ──
  const { data: existing } = await supabase
    .from('facturas_cliente')
    .select('id, numero_completo')
    .eq('comanda_id', comanda_id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      error: `Ya existe la factura ${existing.numero_completo} para esta comanda`,
      factura_id: existing.id,
    }, { status: 409 })
  }

  // ── 3. Obtener items de la comanda ──────────────────────
  const { data: items, error: errItems } = await supabase
    .from('comanda_items')
    .select('id, nombre, cantidad, precio_unitario')
    .eq('comanda_id', comanda_id)
    .eq('restaurante_id', restaurante_id)

  if (errItems || !items?.length) {
    return NextResponse.json({ error: 'Comanda sin items' }, { status: 422 })
  }

  // Calcular importes
  const base_imponible = Math.round(
    items.reduce((sum, it) => sum + (it.precio_unitario ?? 0) * (it.cantidad ?? 1), 0) * 100
  ) / 100

  const iva_pct = 10.00  // restauración España
  const cuota_iva = Math.round(base_imponible * iva_pct / 100 * 100) / 100
  // NOTA: en hostelería el precio ya incluye IVA (precio con IVA)
  // Desglose: base = total / 1.10, cuota = total - base
  const total_con_iva = base_imponible
  const base_sin_iva  = Math.round(total_con_iva / 1.10 * 100) / 100
  const cuota_real    = Math.round((total_con_iva - base_sin_iva) * 100) / 100

  // ── 4. Obtener factura VeriFactu asociada ───────────────
  const { data: factVeri } = await supabase
    .from('facturas_verifactu')
    .select('id')
    .eq('comanda_id', comanda_id)
    .maybeSingle()

  // ── 5. Datos fiscales del emisor (restaurante) ──────────
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nif, razon_social, nombre')
    .eq('id', restaurante_id)
    .single()

  const emisor_nif = rest?.nif ?? 'B00000000'
  const emisor_razon = rest?.razon_social ?? rest?.nombre ?? 'Restaurante'

  // ── 6. Guardar/actualizar cliente fiscal ────────────────
  await supabase
    .from('clientes_fiscales')
    .upsert({
      restaurante_id,
      nif: nifClean,
      razon_social: cliente.razon_social.trim(),
      direccion: cliente.direccion?.trim() ?? null,
      email: cliente.email?.trim() ?? null,
    }, { onConflict: 'restaurante_id,nif' })

  const { data: clienteGuardado } = await supabase
    .from('clientes_fiscales')
    .select('id')
    .eq('restaurante_id', restaurante_id)
    .eq('nif', nifClean)
    .single()

  // ── 7. Siguiente número correlativo (atómico) ───────────
  const anio = new Date().getFullYear()
  const serie = `F${anio}`

  const { data: numData, error: errNum } = await supabase
    .rpc('siguiente_numero_factura_cliente', {
      p_restaurante_id: restaurante_id,
      p_serie: serie,
    })

  if (errNum) {
    return NextResponse.json({ error: 'Error al numerar factura' }, { status: 500 })
  }

  const numero = numData as number

  // ── 8. Items snapshot para la factura ───────────────────
  const itemsSnapshot = items.map(it => ({
    nombre: it.nombre,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    subtotal: Math.round((it.precio_unitario ?? 0) * (it.cantidad ?? 1) * 100) / 100,
  }))

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  // ── 9. Insertar factura ─────────────────────────────────
  const { data: factura, error: errInsert } = await supabase
    .from('facturas_cliente')
    .insert({
      restaurante_id,
      comanda_id,
      cliente_fiscal_id: clienteGuardado?.id ?? null,
      factura_verifactu_id: factVeri?.id ?? null,
      serie,
      numero,
      cliente_nif: nifClean,
      cliente_razon_social: cliente.razon_social.trim(),
      cliente_direccion: cliente.direccion?.trim() ?? null,
      cliente_email: cliente.email?.trim() ?? null,
      emisor_nif,
      emisor_razon_social: emisor_razon,
      base_imponible: base_sin_iva,
      iva_pct,
      cuota_iva: cuota_real,
      total: total_con_iva,
      items: itemsSnapshot,
      emitida_por: session.id,
      motivo: motivo ?? null,
      ip,
    })
    .select()
    .single()

  if (errInsert) {
    console.error('[factura/cliente] Insert error:', errInsert)
    return NextResponse.json({ error: 'Error al guardar factura' }, { status: 500 })
  }

  // ── 10. Audit log ───────────────────────────────────────
  try {
    await supabase.from('comanda_audit_log').insert({
      comanda_id,
      restaurante_id,
      camarero_id: session.id,
      accion: 'factura_cliente_emitida',
      detalle: JSON.stringify({
        numero_completo: factura.numero_completo,
        cliente_nif: nifClean,
        total: total_con_iva,
      }),
    })
  } catch { /* audit no crítico */ }

  console.log(`[factura/cliente] ✓ ${factura.numero_completo} · ${nifClean} · ${total_con_iva}€`)

  return NextResponse.json({ factura }, { status: 201 })
}
