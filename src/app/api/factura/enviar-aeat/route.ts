// POST /api/factura/enviar-aeat
// Prepara y (cuando AEAT lo habilite) envía la factura vía SOAP/XML
// Por ahora: guarda el XML en facturas_verifactu.xml_lroe y marca estado

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getRestauranteId } from '@/lib/session'
import { generarXmlLROE, VERIFACTU_STATUS } from '@/lib/verifactu'

export const runtime = 'nodejs'

// Endpoint AEAT (cuando esté operativo)
const AEAT_ENDPOINT_TEST = 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
const AEAT_ENDPOINT_PROD = 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP'
const AEAT_ACTIVO = false // Cambiar a true cuando la AEAT habilite la recepción

export async function POST(req: NextRequest) {
  const supabase = createServerClient()
  const rid = getRestauranteId(req)
  const { factura_id } = await req.json()

  if (!factura_id) return NextResponse.json({ error: 'factura_id requerido' }, { status: 400 })

  // Obtener factura y datos del restaurante
  const { data: factura } = await supabase
    .from('facturas_verifactu')
    .select('*')
    .eq('id', factura_id)
    .eq('restaurante_id', rid)
    .single()

  if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  if (factura.enviada_aeat) return NextResponse.json({ ok: true, ya_enviada: true })

  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nif, razon_social, nombre, certificado_aeat_p12')
    .eq('id', rid)
    .single()

  const nif_emisor  = rest?.nif ?? 'B00000000'
  const razon_social = rest?.razon_social ?? rest?.nombre ?? 'Restaurante'

  // Generar XML LROE
  const xml = generarXmlLROE({
    factura: {
      numero_serie:    factura.numero_serie,
      numero_factura:  factura.numero_factura,
      fecha_expedicion: factura.fecha_expedicion,
      razon_social:    factura.razon_social,
      nif_emisor:      factura.nif_emisor,
      importe_total:   Number(factura.importe_total),
      base_imponible:  Number(factura.base_imponible),
      cuota_iva:       Number(factura.cuota_iva),
      tipo_iva:        Number(factura.tipo_iva),
      huella:          factura.huella,
      huella_anterior: factura.huella_anterior,
      primer_registro: factura.primer_registro,
      qr_data:         factura.qr_data,
      comanda_id:      factura.comanda_id,
      mesa_label:      factura.mesa_label,
      num_items:       factura.num_items,
    },
    nif_emisor,
    razon_social,
  })

  // Guardar XML siempre (para auditoría)
  await supabase.from('facturas_verifactu')
    .update({ xml_lroe: xml, intentos_envio: (factura.intentos_envio ?? 0) + 1 })
    .eq('id', factura_id)

  // Si AEAT no está activo → informar estado
  if (!AEAT_ACTIVO) {
    await supabase.from('facturas_verifactu')
      .update({ estado_envio: 'pendiente_aeat', error_envio: 'AEAT no ha habilitado la recepción todavía (~2027)' })
      .eq('id', factura_id)

    return NextResponse.json({
      ok: true,
      xml_generado: true,
      enviado_aeat: false,
      estado: 'pendiente_activacion_aeat',
      verifactu_status: VERIFACTU_STATUS,
      mensaje: 'XML generado y guardado. El envío a la AEAT se realizará automáticamente cuando habiliten la recepción.',
    })
  }

  // Cuando AEAT esté activo: enviar SOAP con certificado
  const endpoint = process.env.NODE_ENV === 'production' ? AEAT_ENDPOINT_PROD : AEAT_ENDPOINT_TEST

  // Verificar que el restaurante tiene certificado
  if (!rest?.certificado_aeat_p12) {
    await supabase.from('facturas_verifactu')
      .update({ estado_envio: 'error', error_envio: 'Sin certificado digital configurado' })
      .eq('id', factura_id)
    return NextResponse.json({
      error: 'El restaurante no tiene certificado digital configurado. Ve a /owner → Config → VeriFactu.',
      code: 'SIN_CERTIFICADO'
    }, { status: 422 })
  }

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeGIT/cont/ws/SistemaFacturacion/RegFactuSistemaFacturacion',
      },
      body: xml,
      signal: AbortSignal.timeout(15000),
    })

    const respXml = await resp.text()
    const ok = resp.ok && respXml.includes('Correcto')

    await supabase.from('facturas_verifactu').update({
      enviada_aeat:     ok,
      fecha_envio_aeat: ok ? new Date().toISOString() : null,
      estado_envio:     ok ? 'enviada' : 'error',
      error_envio:      ok ? null : respXml.slice(0, 500),
      respuesta_aeat:   { status: resp.status, body: respXml.slice(0, 2000) },
    }).eq('id', factura_id)

    return NextResponse.json({ ok, enviado_aeat: ok, respuesta: respXml.slice(0, 500) })

  } catch (e) {
    await supabase.from('facturas_verifactu')
      .update({ estado_envio: 'error', error_envio: String(e) })
      .eq('id', factura_id)
    return NextResponse.json({ error: 'Error de conexión con AEAT', detalle: String(e) }, { status: 500 })
  }
}

// GET — estado de conformidad del sistema
export async function GET() {
  return NextResponse.json({ verifactu_status: VERIFACTU_STATUS })
}
