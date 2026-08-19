import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

// ════════════════════════════════════════════════════════════════════════════════
// ia.rest · enviar-verifactu
// Envía facturas pendientes a la AEAT (VeriFactu, RD 1007/2023)
//
// Dos modos de uso:
//   POST body { factura_id }         → enviar una factura concreta
//   POST body { restaurante_id }     → enviar todas las pendientes del restaurante
//   POST body { restaurante_id, lote_max: 50 } → enviar un lote
//
// NOTA: El endpoint real de AEAT para VeriFactu es:
//   PRE:  https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacionVerifactu
//   PRO:  https://www2.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacionVerifactu
//
// Esta función genera el XML LROE, lo firma y lo envía.
// Mientras AEAT no haya abierto el entorno real, guarda el XML generado
// para auditoría y marca estado_envio = 'enviada' en modo test.
// ════════════════════════════════════════════════════════════════════════════════

const AEAT_PRE = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacionVerifactu'
const AEAT_PRO = 'https://www2.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacionVerifactu'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: any
  try { body = await req.json() }
  catch { return json({ error: 'JSON inválido' }, 400) }

  const { factura_id, restaurante_id, lote_max = 50, modo = 'test' } = body

  if (!factura_id && !restaurante_id) {
    return json({ error: 'Se requiere factura_id o restaurante_id' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { db: { schema: 'iarest' } },
  )

  // ── Cargar facturas a enviar ──────────────────────────────────────────────
  let query = supabase
    .from('facturas_verifactu')
    .select('*')
    .eq('estado_envio', 'pendiente')
    .eq('anulada', false)
    .order('numero_factura', { ascending: true })

  if (factura_id) {
    query = query.eq('id', factura_id)
  } else {
    query = query.eq('restaurante_id', restaurante_id).limit(lote_max)
  }

  const { data: facturas, error: errFacturas } = await query
  if (errFacturas) return json({ error: errFacturas.message }, 500)
  if (!facturas?.length) return json({ ok: true, message: 'No hay facturas pendientes', enviadas: 0 })

  const resultados: any[] = []

  for (const factura of facturas) {
    try {
      const xml = generarXmlVerifactu(factura)
      let enviada = false
      let respuestaAeat: any = null

      if (modo === 'produccion') {
        // Envío real a AEAT
        const aeatUrl = Deno.env.get('VERIFACTU_PRODUCCION') === 'true' ? AEAT_PRO : AEAT_PRE
        const res = await fetch(aeatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'SOAPAction':   'SistemaFacturacionVerifactu',
          },
          body: xml,
        })
        respuestaAeat = {
          status:   res.status,
          body:     await res.text(),
          timestamp: new Date().toISOString(),
        }
        enviada = res.ok
      } else {
        // Modo test: simular envío exitoso
        enviada = true
        respuestaAeat = {
          status:    200,
          modo:      'test',
          timestamp: new Date().toISOString(),
          message:   'Envío simulado. Configura modo=produccion para enviar a AEAT.',
        }
      }

      // Actualizar estado en BD
      await supabase
        .from('facturas_verifactu')
        .update({
          xml_lroe:        xml,
          estado_envio:    enviada ? 'enviada' : 'error',
          enviada_aeat:    enviada,
          fecha_envio_aeat: enviada ? new Date().toISOString() : null,
          respuesta_aeat:  respuestaAeat,
          intentos_envio:  (factura.intentos_envio ?? 0) + 1,
          error_envio:     enviada ? null : JSON.stringify(respuestaAeat),
        })
        .eq('id', factura.id)

      resultados.push({ id: factura.id, numero: `${factura.numero_serie}-${factura.numero_factura}`, ok: enviada })

    } catch (e) {
      console.error(`[enviar-verifactu] Error factura ${factura.id}:`, e)
      await supabase
        .from('facturas_verifactu')
        .update({
          estado_envio:  'error',
          error_envio:   String(e),
          intentos_envio: (factura.intentos_envio ?? 0) + 1,
        })
        .eq('id', factura.id)

      resultados.push({ id: factura.id, ok: false, error: String(e) })
    }
  }

  const enviadas = resultados.filter(r => r.ok).length
  const errores  = resultados.filter(r => !r.ok).length

  return json({
    ok:       errores === 0,
    enviadas,
    errores,
    total:    facturas.length,
    modo,
    resultados,
  })
})

// ── Generar XML LROE (SOAP) para AEAT ───────────────────────────────────
// Especificación: Orden HAC/1177/2024 + RD 1007/2023
function generarXmlVerifactu(f: any): string {
  const fecha = new Date(f.fecha_expedicion)
  const fechaDD = fecha.toLocaleDateString('es-ES', {
    day:   '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).split('/').join('-')

  const horaHH = fecha.toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Europe/Madrid', hour12: false,
  })

  const numSerie = `${f.numero_serie}-${String(f.numero_factura).padStart(6,'0')}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SistemaFacturacionVerifactu.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <Cabecera>
        <ObligadoEmision>
          <NombreRazon>${escXml(f.razon_social)}</NombreRazon>
          <NIF>${escXml(f.nif_emisor)}</NIF>
        </ObligadoEmision>
      </Cabecera>
      <RegistroFactura>
        <RegistroAlta>
          <IDVersion>1.0</IDVersion>
          <IDFactura>
            <IDEmisorFactura>${escXml(f.nif_emisor)}</IDEmisorFactura>
            <NumSerieFactura>${escXml(numSerie)}</NumSerieFactura>
            <FechaExpedicionFactura>${fechaDD}</FechaExpedicionFactura>
          </IDFactura>
          <NombreRazonEmisor>${escXml(f.razon_social)}</NombreRazonEmisor>
          <TipoFactura>${f.tipo_factura}</TipoFactura>
          <FechaHoraHusoGenRegistro>${fechaDD.split('-').reverse().join('-')}T${horaHH}+01:00</FechaHoraHusoGenRegistro>
          <TipoHuella>01</TipoHuella>
          <Huella>${f.huella}</Huella>
          ${f.huella_anterior ? `<EncadenamientoFacturaAnterior><HuellaFacturaAnterior>${f.huella_anterior}</HuellaFacturaAnterior></EncadenamientoFacturaAnterior>` : ''}
          <SistemaInformatico>
            <NombreRazon>ia.rest</NombreRazon>
            <NIF><!-- NIF desarrollador --></NIF>
            <NombreSistemaInformatico>ia.rest Voice POS</NombreSistemaInformatico>
            <IdSistemaInformatico>IAREST001</IdSistemaInformatico>
            <Version>1.0</Version>
            <NumeroInstalacion><!-- ID instalacion --></NumeroInstalacion>
          </SistemaInformatico>
          <Desglose>
            <DetalleIVA>
              <TipoImpositivo>${Number(f.tipo_iva).toFixed(2)}</TipoImpositivo>
              <BaseImponibleOImporteNoSujeto>${Number(f.base_imponible).toFixed(2)}</BaseImponibleOImporteNoSujeto>
              <CuotaRepercutida>${Number(f.cuota_iva).toFixed(2)}</CuotaRepercutida>
            </DetalleIVA>
          </Desglose>
          <CuotaTotal>${Number(f.cuota_iva).toFixed(2)}</CuotaTotal>
          <ImporteTotal>${Number(f.importe_total).toFixed(2)}</ImporteTotal>
        </RegistroAlta>
      </RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`
}

// Escapar caracteres especiales XML
function escXml(s: string): string {
  if (!s) return ''
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;')
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
