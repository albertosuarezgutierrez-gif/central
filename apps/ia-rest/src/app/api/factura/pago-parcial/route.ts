export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/factura/pago-parcial
// Registra un pago parcial de cuenta dividida.
// Los N-1 primeros pagos guardan en `pagos` sin cerrar la comanda.
// El último (parte_num === total_partes) genera factura + cierra comanda.
// Body: { comanda_id, mesa_label?, metodo_id, importe_parcial,
//         parte_num, total_partes, entregado?, propina? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId, getSession } from '@/lib/session'
import { construirFactura } from '@/lib/verifactu'
import { crearPrintJobCuenta } from '@/lib/courier'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase      = createServerClient()
  const restaurante_id = getRestauranteId(req)
  const session       = getSession(req)

  let body: {
    comanda_id: string; mesa_label?: string
    metodo_id: string; importe_parcial: number
    parte_num: number; total_partes: number
    entregado?: number; propina?: number
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }

  const {
    comanda_id, mesa_label = 'Mesa', metodo_id,
    importe_parcial, parte_num, total_partes,
    entregado = 0, propina = 0,
  } = body

  if (!comanda_id || !metodo_id)
    return NextResponse.json({ error: 'comanda_id y metodo_id requeridos' }, { status: 400 })
  if (parte_num < 1 || parte_num > total_partes)
    return NextResponse.json({ error: 'parte_num inválido' }, { status: 400 })

  // ── 1. Verificar comanda ────────────────────────────────────
  const { data: comanda } = await supabase
    .from('comandas')
    .select('id, estado, local_id, camarero_id, turno_id, mesa_id')
    .eq('id', comanda_id).eq('local_id', restaurante_id).single()

  if (!comanda)
    return NextResponse.json({ error: 'Comanda no encontrada' }, { status: 404 })
  if (comanda.estado === 'cerrada')
    return NextResponse.json({ error: 'Comanda ya cerrada' }, { status: 409 })

  // ── 2. Método de pago ───────────────────────────────────────
  const { data: metodo } = await supabase
    .from('metodos_pago').select('id, nombre, tipo').eq('id', metodo_id).single()
  if (!metodo)
    return NextResponse.json({ error: 'Método de pago no encontrado' }, { status: 404 })

  const propina_val  = Math.round((propina ?? 0) * 100) / 100
  const importe_real = Math.round(importe_parcial * 100) / 100
  const cambio = metodo.tipo === 'efectivo' && entregado > importe_real
    ? Math.round((entregado - importe_real) * 100) / 100
    : 0

  const es_ultimo = parte_num === total_partes

  // ── 3. Guardar pago parcial en pagos ────────────────────────
  await supabase.from('pagos').insert({
    local_id: restaurante_id,
    comanda_id,
    metodo_id,
    importe:      importe_real,
    entregado:    metodo.tipo === 'efectivo' ? entregado : 0,
    cambio,
    propina:      propina_val > 0 ? propina_val : null,
    metodo_tipo:  metodo.tipo,
    camarero_id:  session?.id ?? comanda.camarero_id,
    estado:       es_ultimo ? 'completado' : 'parcial',
    notas:        `Parte ${parte_num}/${total_partes}`,
  })

  // ── Si NO es el último → responder sin cerrar ───────────────
  if (!es_ultimo) {
    return NextResponse.json({ ok: true, cerrada: false, cambio, parte_num })
  }

  // ── 4. Último pago: items + total real de la comanda ────────
  const { data: items } = await supabase
    .from('comanda_items')
    .select('precio_unitario, cantidad, nombre')
    .eq('comanda_id', comanda_id).eq('local_id', restaurante_id)

  const importe_total = Math.round(
    (items ?? []).reduce((s, it) => s + (it.precio_unitario ?? 0) * (it.cantidad ?? 1), 0) * 100
  ) / 100

  // ── 5. Datos fiscales del restaurante ───────────────────────
  const { data: rest } = await supabase
    .from('restaurantes').select('nif, razon_social, nombre').eq('id', restaurante_id).single()

  const nif_emisor   = rest?.nif          ?? 'B00000000'
  const razon_social = rest?.razon_social ?? rest?.nombre ?? 'Restaurante'

  // ── 6. Número de factura ────────────────────────────────────
  const { data: secRows } = await supabase
    .rpc('siguiente_numero_factura', { p_restaurante_id: restaurante_id, p_serie: 'T' })

  const { numero, huella_ant, es_primera } = (secRows?.[0] ?? {}) as {
    numero: number; huella_ant: string | null; es_primera: boolean
  }

  // ── 7. Construir y guardar factura VeriFactu ────────────────
  const facturaData = construirFactura({
    nif_emisor, razon_social,
    numero_serie:     'T',
    numero_factura:   numero,
    huella_anterior:  huella_ant,
    primer_registro:  es_primera,
    comanda_id, mesa_label,
    num_items:        (items ?? []).length,
    importe_total,
  })

  const { data: factura } = await supabase
    .from('facturas_verifactu')
    .insert({
      local_id: restaurante_id, ...facturaData,
      metodo_pago:  'Dividida',
      metodo_tipo:  'dividida',
      entregado:    0,
      cambio:       0,
      propina:      null,
      camarero_id:  session?.id ?? comanda.camarero_id,
    })
    .select().single()

  // ── 8. Registrar en caja ────────────────────────────────────
  const { data: camData } = await supabase
    .from('personal').select('nombre').eq('id', session?.id ?? comanda.camarero_id).single()

  await supabase.rpc('registrar_cobro_caja', {
    p_restaurante_id:   restaurante_id,
    p_turno_id:         comanda.turno_id,
    p_camarero_id:      session?.id ?? comanda.camarero_id,
    p_camarero_nombre:  camData?.nombre ?? session?.nombre ?? 'Equipo',
    p_factura_id:       factura?.id ?? '',
    p_comanda_id:       comanda_id,
    p_mesa_label:       mesa_label,
    p_importe:          importe_total,
    p_entregado:        importe_total,
    p_cambio:           0,
    p_metodo_tipo:      'dividida',
  })

  // ── 9. Cerrar comanda + liberar mesa ────────────────────────
  await supabase.from('comandas').update({ estado: 'cerrada' }).eq('id', comanda_id)
  if (comanda.mesa_id) {
    await supabase.from('mesas')
      .update({ estado: 'libre', camarero_id: null, ultima_comanda: new Date().toISOString() })
      .eq('id', comanda.mesa_id).eq('local_id', restaurante_id)
  }

  // ── 10. Imprimir ticket cobrado ─────────────────────────────
  try {
    const { data: mesaData } = await supabase
      .from('mesas').select('codigo, zona_id, zona:zonas(nombre, tipo)')
      .eq('id', comanda.mesa_id ?? '').single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mesaObj = mesaData as any

    await crearPrintJobCuenta({
      comanda_id, local_id: restaurante_id, mesa_label,
      zona_tipo:           mesaObj?.zona?.tipo   ?? null,
      zona_nombre:         mesaObj?.zona?.nombre ?? null,
      camarero_nombre:     camData?.nombre ?? 'Equipo',
      numero_ticket:       0,
      restaurante_nombre:  rest?.nombre ?? razon_social,
      restaurante_direccion: null,
      nif_emisor, razon_social,
      cobrado:      true,
      metodo_pago:  'Dividida',
      entregado:    null,
      cambio:       null,
      items: (items ?? []).map(it => ({
        nombre:          it.nombre,
        cantidad:        it.cantidad ?? 1,
        precio_unitario: it.precio_unitario ?? 0,
      })),
      total: importe_total,
    })
  } catch (e) {
    console.warn('[pago-parcial] Aviso: no se pudo imprimir ticket:', e)
  }

  console.log(`[pago-parcial] ✓ Factura ${numero} · ${importe_total}€ · ${total_partes} partes · cerrada`)

  return NextResponse.json({
    ok:            true,
    cerrada:       true,
    factura,
    importe_total,
    parte_num,
  }, { status: 201 })
}
