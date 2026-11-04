export const dynamic = 'force-dynamic'

// ============================================================
// POST /api/factura/anular
// Anula una factura existente (registro de anulación encadenado)
// Body: { factura_id: string }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { construirAnulacion, eslabonDeFila } from '@/lib/verifactu'

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
    .eq('local_id', restaurante_id)
    .single()

  if (error || !factura) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }
  if (factura.anulada) {
    return NextResponse.json({ error: 'Ya anulada' }, { status: 422 })
  }

  // Registro de anulación VeriFactu (huella propia: IDEmisorFacturaAnulada, NumSerieFacturaAnulada,
  // FechaExpedicionFacturaAnulada, Huella anterior, FechaHoraHusoGenRegistro). Un único instante para la
  // huella y para fecha_anulacion: así la huella es recalculable desde la fila.
  // ⚠️ Pendiente: la spec encadena la anulación al ÚLTIMO registro de la cadena del emisor; ia.rest la encadena
  // a la propia factura anulada y la siguiente alta no la incluye (la RPC solo mira altas).
  const ahora = new Date()
  const anulacion = construirAnulacion({ factura, anterior: eslabonDeFila(factura), ahora })

  const { data: updated, error: errUpd } = await supabase
    .from('facturas_verifactu')
    .update({
      anulada:          true,
      fecha_anulacion:  ahora.toISOString(),
      huella_anulacion: anulacion.huella,
    })
    .eq('id', factura_id)
    .select()
    .single()

  if (errUpd) {
    return NextResponse.json({ error: errUpd.message }, { status: 500 })
  }

  return NextResponse.json({ factura: updated })
}
