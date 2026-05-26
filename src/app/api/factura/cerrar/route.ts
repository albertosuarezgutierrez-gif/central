export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/factura/cerrar
// Cierra una comanda, genera factura Verifactu y registra cobro
// Body: { comanda_id, mesa_label?, metodo_id, entregado?, notas?, propina? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { construirFactura } from '@/lib/verifactu'
import { crearPrintJobCuenta } from '@/lib/courier'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session = getSession(req)

  let body: {
    comanda_id: string; mesa_label?: string
    metodo_id?: string; entregado?: number; notas?: string; propina?: number
    cliente_email?: string; cliente_nombre?: string; propina_digital?: boolean
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const { comanda_id, mesa_label = 'Mesa', metodo_id, entregado = 0, notas, propina = 0,
          cliente_email, cliente_nombre, propina_digital = false } = body
  if (!comanda_id) return NextResponse.json({ error: 'comanda_id requerido' }, { status: 400 })
  if (!metodo_id)  return NextResponse.json({ error: 'metodo_id requerido — selecciona método de pago' }, { status: 400 })

  // ── 1. Verificar comanda ────────────────────────────────
  const { data: comanda } = await supabase
    .from('comandas').select('id, estado, restaurante_id, camarero_id, turno_id, mesa_id')
    .eq('id', comanda_id).eq('restaurante_id', restaurante_id).single()

  if (!comanda) return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })

  if (comanda.estado === 'cerrada') {
    const { data: factExist } = await supabase
      .from('facturas_verifactu').select('id, numero_factura, importe_total, hash_sha256, qr_content, estado, created_at').eq('comanda_id', comanda_id).single()
    if (factExist) return NextResponse.json({ factura: factExist, ya_existia: true })
  }

  // ── 2. Método de pago ───────────────────────────────────
  const { data: metodo } = await supabase
    .from('metodos_pago').select('id, nombre, tipo').eq('id', metodo_id).single()
  if (!metodo) return NextResponse.json({ error: 'Método de pago no encontrado' }, { status: 404 })

  // ── 3. Items y total ────────────────────────────────────
  const { data: items, error: errItems } = await supabase
    .from('comanda_items').select('precio_unitario, cantidad, nombre')
    .eq('comanda_id', comanda_id).eq('restaurante_id', restaurante_id)

  if (errItems || !items?.length)
    return NextResponse.json({ error: 'Comanda sin items — no se puede facturar' }, { status: 422 })

  const importe_total = Math.round(
    items.reduce((sum, it) => sum + (it.precio_unitario ?? 0) * (it.cantidad ?? 1), 0) * 100
  ) / 100

  if (importe_total <= 0)
    return NextResponse.json({ error: 'Importe total 0 — revisa precios en la carta' }, { status: 422 })

  const propina_val = Math.round((propina ?? 0) * 100) / 100
  const total_cobrar = Math.round((importe_total + propina_val) * 100) / 100

  const cambio = metodo.tipo === 'efectivo' && entregado > total_cobrar
    ? Math.round((entregado - total_cobrar) * 100) / 100
    : 0

  // ── 4. Datos fiscales ───────────────────────────────────
  const { data: rest } = await supabase
    .from('restaurantes').select('nif, razon_social, nombre').eq('id', restaurante_id).single()

  const nif_emisor   = rest?.nif         ?? 'B00000000'
  const razon_social = rest?.razon_social ?? rest?.nombre ?? 'Restaurante'

  // ── 5. Número de factura ────────────────────────────────
  const { data: secRows, error: errSec } = await supabase
    .rpc('siguiente_numero_factura', { p_restaurante_id: restaurante_id, p_serie: 'T' })

  if (errSec) {
    console.error('[factura/cerrar] RPC error:', errSec)
    return NextResponse.json({ error: 'Error al numerar factura' }, { status: 500 })
  }

  const { numero, huella_ant, es_primera } = secRows[0] as {
    numero: number; huella_ant: string | null; es_primera: boolean
  }

  // ── 6. Construir y guardar factura ──────────────────────
  const facturaData = construirFactura({
    nif_emisor, razon_social,
    numero_serie: 'T', numero_factura: numero,
    huella_anterior: huella_ant, primer_registro: es_primera,
    comanda_id, mesa_label, num_items: items.length, importe_total,
  })

  const { data: factura, error: errInsert } = await supabase
    .from('facturas_verifactu')
    .insert({
      restaurante_id, ...facturaData,
      metodo_pago:  metodo.nombre,
      metodo_tipo:  metodo.tipo,
      entregado:    metodo.tipo === 'efectivo' ? entregado : 0,
      cambio,
      propina:      propina_val > 0 ? propina_val : null,
      camarero_id:  session?.id ?? comanda.camarero_id,
    })
    .select().single()

  if (errInsert) {
    console.error('[factura/cerrar] Insert error:', errInsert)
    return NextResponse.json({ error: 'Error al guardar factura' }, { status: 500 })
  }

  // ── 7. Registrar pago ───────────────────────────────────
  await supabase.from('pagos').insert({
    restaurante_id, comanda_id,
    metodo_id,
    importe: importe_total,
    entregado: metodo.tipo === 'efectivo' ? entregado : 0,
    cambio,
    propina: propina_val > 0 ? propina_val : null,
    metodo_tipo: metodo.tipo,
    camarero_id: session?.id ?? comanda.camarero_id,
    notas: notas ?? null,
    estado: 'completado',
  })

  // ── 8. Registrar en caja si es efectivo ─────────────────
  if (metodo.tipo === 'efectivo') {
    const { data: cam } = await supabase
      .from('personal').select('nombre').eq('id', session?.id ?? comanda.camarero_id).single()

    await supabase.rpc('registrar_cobro_caja', {
      p_restaurante_id:  restaurante_id,
      p_turno_id:        comanda.turno_id,
      p_camarero_id:     session?.id ?? comanda.camarero_id,
      p_camarero_nombre: cam?.nombre ?? 'Camarero',
      p_factura_id:      factura.id,
      p_comanda_id:      comanda_id,
      p_mesa_label:      mesa_label,
      p_importe:         importe_total,
      p_entregado:       entregado,
      p_cambio:          cambio,
      p_metodo_tipo:     metodo.tipo,
    })
  }

  // ── 9. Marcar comanda cerrada + liberar mesa ────────────
  const updateComanda: Record<string, unknown> = { estado: 'cerrada', cerrada_at: new Date().toISOString() }
  if (cliente_email) { updateComanda.cliente_email = cliente_email; updateComanda.cliente_nombre = cliente_nombre ?? null }
  await supabase.from('comandas').update(updateComanda).eq('id', comanda_id)
  if (comanda.mesa_id) {
    await supabase.from('mesas')
      .update({ estado: 'libre', camarero_id: null, ultima_comanda: new Date().toISOString() })
      .eq('id', comanda.mesa_id)
      .eq('restaurante_id', restaurante_id)
  }

  // ── 9b. Generar token propina digital si lo pidió el camarero ──
  let propina_token: string | null = null
  if (propina_digital) {
    const { data: restConfig } = await supabase
      .from('restaurantes').select('propinas_activas').eq('id', restaurante_id).single()
    if (restConfig?.propinas_activas) {
      propina_token = `${comanda_id.slice(0,8)}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
      await supabase.from('propinas').insert({
        restaurante_id,
        comanda_id,
        token: propina_token,
        estado: 'pendiente',
      })
    }
  }

  console.log(`[factura/cerrar] ✓ Factura ${numero} · ${importe_total}€ · propina ${propina_val}€ · ${metodo.nombre} · cambio ${cambio}€`)

  // ── 10. Imprimir ticket COBRADO ─────────────────────────
  try {
    // Recuperar items con precios para el ticket
    const { data: camData } = await supabase
      .from('personal').select('nombre').eq('id', session?.id ?? comanda.camarero_id).single()
    const { data: mesaData } = await supabase
      .from('mesas').select('codigo, zona_id, zona:zonas(nombre, tipo)')
      .eq('id', comanda.mesa_id ?? '').single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesaObj = mesaData as any

    await crearPrintJobCuenta({
      comanda_id,
      restaurante_id,
      mesa_label,
      zona_tipo:   mesaObj?.zona?.tipo   ?? null,
      zona_nombre: mesaObj?.zona?.nombre ?? null,
      camarero_nombre: camData?.nombre ?? session?.nombre ?? 'Equipo',
      numero_ticket: 0,
      restaurante_nombre: rest?.nombre ?? razon_social,
      restaurante_direccion: null,
      nif_emisor:  nif_emisor,
      razon_social: razon_social,
      cobrado: true,
      metodo_pago: metodo.nombre,
      entregado: metodo.tipo === 'efectivo' ? entregado : null,
      cambio:    cambio > 0 ? cambio : null,
      items: items.map(it => ({
        nombre:          it.nombre,
        cantidad:        it.cantidad ?? 1,
        precio_unitario: it.precio_unitario ?? 0,
      })),
      total: importe_total,
    })
  } catch (e) {
    // No bloquear el cobro si la impresión falla
    console.warn('[factura/cerrar] Aviso: no se pudo imprimir ticket cobrado:', e)
  }

  return NextResponse.json({
    factura,
    metodo: metodo.nombre,
    importe_total,
    propina: propina_val,
    cambio,
    ya_existia: false,
    propina_token,
  }, { status: 201 })
}

