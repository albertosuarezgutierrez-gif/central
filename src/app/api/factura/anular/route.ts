export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/factura/anular
// Anula una factura existente (registro de anulación encadenado)
// Body: { factura_id: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { calcularHuella } from '@/lib/verifactu'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const restaurante_id = getRestauranteId(req)

  const { factura_id } = await req.json()
  if (!factura_id) {
    return NextResponse.json({ error: 'factura_id requerido' }, { status: 400 })
  }

  const { data: factura, error } = await supabase
    .from('facturas_verifactu')
    .select('*')
    .eq('id', factura_id)
    .eq('restaurante_id', restaurante_id)
    .single()

  if (error || !factura) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }
  if (factura.anulada) {
    return NextResponse.json({ error: 'Ya anulada' }, { status: 422 })
  }

  // Hash de anulación: mismo cálculo pero con TipoFactura=A (anulación)
  const huellaAnulacion = calcularHuella({
    nif_emisor:       factura.nif_emisor,
    numero_serie:     factura.numero_serie,
    numero_factura:   factura.numero_factura,
    fecha_expedicion: new Date().toISOString(),
    importe_total:    0,
    cuota_iva:        0,
    huella_anterior:  factura.huella,
  })

  const { data: updated, error: errUpd } = await supabase
    .from('facturas_verifactu')
    .update({
      anulada:          true,
      fecha_anulacion:  new Date().toISOString(),
      huella_anulacion: huellaAnulacion,
    })
    .eq('id', factura_id)
    .select()
    .single()

  if (errUpd) {
    return NextResponse.json({ error: errUpd.message }, { status: 500 })
  }

  return NextResponse.json({ factura: updated })
}
