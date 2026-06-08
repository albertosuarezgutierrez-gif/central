export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'
import { generarSEPA, type SepaOrdenante, type SepaPago } from '@/lib/sepa'
import { enviarEmailPagoEjecutado } from '@/lib/email'

/**
 * POST /api/owner/pagos/sepa
 * Body: { orden_ids: string[] }  — IDs de órdenes aprobadas a incluir en el fichero
 * Genera XML SEPA pain.001.001.03 descargable.
 * El fichero se sube al portal del banco sin intermediario ni coste.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const rid = getRestauranteId(req)
  const supabase = createServerClient()

  const { orden_ids } = await req.json()
  if (!orden_ids?.length) return NextResponse.json({ error: 'orden_ids requeridos' }, { status: 400 })

  // Cargar órdenes aprobadas + datos del restaurante
  const [rOrdenes, rRest] = await Promise.all([
    supabase
      .from('ordenes_pago_proveedor')
      .select('*, proveedores(iban, bic, nombre)')
      .eq('local_id', rid)
      .eq('estado', 'aprobado')
      .in('id', orden_ids),
    supabase
      .from('restaurantes')
      .select('razon_social, nombre, iban_ordenante, bic_ordenante, nif')
      .eq('id', rid)
      .single()
  ])

  if (rOrdenes.error) return NextResponse.json({ error: rOrdenes.error.message }, { status: 500 })
  const ordenes = rOrdenes.data ?? []
  if (!ordenes.length) return NextResponse.json({ error: 'Sin órdenes aprobadas con esos IDs' }, { status: 400 })

  const rest = rRest.data
  if (!rest?.iban_ordenante) {
    return NextResponse.json({
      error: 'Configura el IBAN del restaurante en /owner → Restaurante → Datos bancarios antes de exportar SEPA'
    }, { status: 422 })
  }

  const ordenante: SepaOrdenante = {
    nombre: rest.razon_social || rest.nombre,
    iban:   rest.iban_ordenante,
    bic:    rest.bic_ordenante ?? undefined,
    nif:    rest.nif ?? undefined,
  }

  const pagos: SepaPago[] = []
  const sinIBAN: string[] = []

  for (const o of ordenes) {
    const prov = o.proveedores as { iban?: string | null; bic?: string | null; nombre?: string } | null
    const iban = prov?.iban
    if (!iban) { sinIBAN.push(o.proveedor_nombre); continue }

    pagos.push({
      id:               `IAREST-${o.id.slice(0, 8).toUpperCase()}`,
      acreedor_nombre:  o.proveedor_nombre,
      acreedor_iban:    iban,
      acreedor_bic:     prov?.bic ?? undefined,
      importe:          Number(o.importe),
      concepto:         o.concepto,
      fecha_ejecucion:  o.fecha_vencimiento,
    })
  }

  if (!pagos.length) {
    return NextResponse.json({
      error: `Sin pagos exportables. Proveedores sin IBAN configurado: ${sinIBAN.join(', ')}`
    }, { status: 422 })
  }

  let xml: string
  try {
    xml = generarSEPA(ordenante, pagos)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  // Marcar órdenes como enviadas SEPA
  const idsExportados = ordenes.filter(o => {
    const prov = o.proveedores as { iban?: string | null } | null
    return prov?.iban
  }).map(o => o.id)

  await supabase
    .from('ordenes_pago_proveedor')
    .update({ estado: 'enviado_sepa', sepa_msg_id: `IAREST-${Date.now()}` })
    .in('id', idsExportados)

  // Enviar confirmación de pago a cada proveedor
  for (const pago of pagos) {
    const orden = ordenes.find(o => {
      const p = o.proveedores as { iban?: string | null; nombre?: string } | null
      return p?.iban === pago.acreedor_iban
    })
    if (orden) {
      const emailProv = (orden.proveedores as { email?: string | null } | null)?.email
      if (emailProv) {
        try {
          await enviarEmailPagoEjecutado({
            email:             emailProv,
            nombreProveedor:   orden.proveedor_nombre,
            nombreRestaurante: rest.razon_social || rest.nombre,
            importe:           pago.importe,
            canal:             'sepa',
            referencia:        pago.id,
            concepto:          pago.concepto,
          })
        } catch (e) { console.error('[Email pago SEPA]', e) }
      }
    }
  }

  const filename = `sepa-pagos-${new Date().toISOString().slice(0, 10)}.xml`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-SEPA-Pagos': String(pagos.length),
      'X-SEPA-Total': pagos.reduce((s, p) => s + p.importe, 0).toFixed(2),
      ...(sinIBAN.length ? { 'X-SEPA-Sin-IBAN': sinIBAN.join(', ') } : {}),
    }
  })
}
