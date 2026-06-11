// ============================================================
// ia.rest · VERIFACTU — Hash encadenado RD 1007/2023
// Phase 1: registros locales + QR en ticket ✅
// Phase 2: envío SOAP/XML a AEAT (cuando AEAT lo habilite ~2027)
// ============================================================
// Spec: "Sistemas Informáticos de Facturación v1.0.3" (AEAT, 28/07/2025)
//   Sección 9.1.1 — Encadenamiento de registros de facturación
// ============================================================

import {
  calcularFiscal,
  calcularHuella,
  generarQrData,
  parseFechaLocalAEAT,
  escapeXml,
} from '@central/core-fiscal'
import type { RegistroFactura } from '@central/core-fiscal'

// Las primitivas PURAS (huella AEAT encadenada, QR, IVA, helpers) viven en el
// núcleo compartido @central/core-fiscal (casa de marcas). Aquí se re-exportan
// para conservar la API pública de @/lib/verifactu, y se quedan los ADAPTADORES
// específicos de ia.rest: construirFactura (now()/huso) y generarXmlLROE
// (bloque SistemaInformatico con la identidad del sistema).
export { calcularFiscal, calcularHuella, generarQrData }
export type { RegistroFactura }

export interface FacturaVeri {
  numero_serie:     string
  numero_factura:   number
  fecha_expedicion: string
  razon_social:     string
  nif_emisor:       string
  importe_total:    number
  base_imponible:   number
  cuota_iva:        number
  tipo_iva:         number
  huella:           string
  huella_anterior:  string | null
  primer_registro:  boolean
  qr_data:          string
  comanda_id:       string
  mesa_label:       string
  num_items:        number
}

// ── Construir FacturaVeri completa ───────────────────────────

export function construirFactura(params: {
  nif_emisor:       string
  razon_social:     string
  numero_serie:     string
  numero_factura:   number
  huella_anterior:  string | null
  primer_registro:  boolean
  comanda_id:       string
  mesa_label:       string
  num_items:        number
  importe_total:    number
  tipo_iva?:        number
}): FacturaVeri {
  const ahora = new Date()
  // Construir ISO con offset Madrid (+01:00 invierno / +02:00 verano)
  const offsetMs = -ahora.getTimezoneOffset() * 60000
  const offsetH  = Math.floor(Math.abs(ahora.getTimezoneOffset()) / 60)
  const offsetM  = Math.abs(ahora.getTimezoneOffset()) % 60
  const sign     = ahora.getTimezoneOffset() <= 0 ? '+' : '-'
  const offsetStr = `${sign}${String(offsetH).padStart(2,'0')}:${String(offsetM).padStart(2,'0')}`
  const localISO  = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 19) + offsetStr

  const fecha_yyyy_mm_dd = localISO.slice(0, 10)
  const tipo_iva = params.tipo_iva ?? 10
  const { base_imponible, cuota_iva } = calcularFiscal(params.importe_total, tipo_iva)

  const reg: RegistroFactura = {
    nif_emisor:       params.nif_emisor,
    numero_serie:     params.numero_serie,
    numero_factura:   params.numero_factura,
    fecha_expedicion: localISO,
    importe_total:    params.importe_total,
    cuota_iva,
    huella_anterior:  params.huella_anterior,
  }

  const huella  = calcularHuella(reg)
  const qr_data = generarQrData({
    nif:     params.nif_emisor,
    serie:   params.numero_serie,
    numero:  params.numero_factura,
    fecha:   fecha_yyyy_mm_dd,
    importe: params.importe_total,
  })

  return {
    numero_serie:    params.numero_serie,
    numero_factura:  params.numero_factura,
    fecha_expedicion: localISO,
    razon_social:    params.razon_social,
    nif_emisor:      params.nif_emisor,
    importe_total:   params.importe_total,
    base_imponible,
    cuota_iva,
    tipo_iva,
    huella,
    huella_anterior: params.huella_anterior,
    primer_registro: params.primer_registro,
    qr_data,
    comanda_id:      params.comanda_id,
    mesa_label:      params.mesa_label,
    num_items:       params.num_items,
  }
}

// ── Generar XML LROE para envío a AEAT (Phase 2) ─────────────
// Cuando la AEAT habilite la recepción (~2027), usar este XML
// junto con el certificado digital del restaurante (PKCS#12)

export function generarXmlLROE(params: {
  factura: FacturaVeri
  nif_emisor: string
  razon_social: string
}): string {
  const { factura: f } = params
  const fechaAEAT = parseFechaLocalAEAT(f.fecha_expedicion)
  const numSerie  = `${f.numero_serie}-${String(f.numero_factura).padStart(8, '0')}`

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeGIT/cont/ws/SistemaFacturacion.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <sum:RegFactuSistemaFacturacion>
      <sum:Cabecera>
        <sum:ObligadoEmision>
          <sum:NombreRazon>${escapeXml(params.razon_social)}</sum:NombreRazon>
          <sum:NIF>${params.nif_emisor}</sum:NIF>
        </sum:ObligadoEmision>
      </sum:Cabecera>
      <sum:RegistroFactura>
        <sum:RegistroAlta>
          <sum:IDVersion>1.0</sum:IDVersion>
          <sum:IDFactura>
            <sum:IDEmisorFactura>${params.nif_emisor}</sum:IDEmisorFactura>
            <sum:NumSerieFactura>${numSerie}</sum:NumSerieFactura>
            <sum:FechaExpedicionFacturaEmisor>${fechaAEAT}</sum:FechaExpedicionFacturaEmisor>
          </sum:IDFactura>
          <sum:NombreRazonEmisor>${escapeXml(params.razon_social)}</sum:NombreRazonEmisor>
          <sum:Subsanacion>N</sum:Subsanacion>
          <sum:RechazoPrevio>N</sum:RechazoPrevio>
          <sum:TipoFactura>F2</sum:TipoFactura>
          <sum:TipoRectificativa/>
          <sum:FechaOperacion>${fechaAEAT}</sum:FechaOperacion>
          <sum:DescripcionOperacion>Servicio de restauración</sum:DescripcionOperacion>
          <sum:Desglose>
            <sum:DetalleIVA>
              <sum:TipoImpositivo>${f.tipo_iva.toFixed(2)}</sum:TipoImpositivo>
              <sum:BaseImponibleOimporteNoSujeto>${f.base_imponible.toFixed(2)}</sum:BaseImponibleOimporteNoSujeto>
              <sum:CuotaRepercutida>${f.cuota_iva.toFixed(2)}</sum:CuotaRepercutida>
            </sum:DetalleIVA>
          </sum:Desglose>
          <sum:CuotaTotal>${f.cuota_iva.toFixed(2)}</sum:CuotaTotal>
          <sum:ImporteTotal>${f.importe_total.toFixed(2)}</sum:ImporteTotal>
          <sum:Encadenamiento>
            ${f.primer_registro
              ? '<sum:PrimerRegistro>S</sum:PrimerRegistro>'
              : `<sum:RegistroAnterior>
              <sum:IDEmisorFactura>${params.nif_emisor}</sum:IDEmisorFactura>
              <sum:NumSerieFactura>${f.numero_serie}-${String(f.numero_factura - 1).padStart(8,'0')}</sum:NumSerieFactura>
              <sum:FechaExpedicionFacturaEmisor>${fechaAEAT}</sum:FechaExpedicionFacturaEmisor>
              <sum:Huella>${f.huella_anterior}</sum:Huella>
            </sum:RegistroAnterior>`
            }
          </sum:Encadenamiento>
          <sum:SistemaInformatico>
            <sum:NombreRazon>ia.rest SL</sum:NombreRazon>
            <sum:NIF>B00000000</sum:NIF>
            <sum:NombreSistemaInformatico>ia.rest</sum:NombreSistemaInformatico>
            <sum:IdSistemaInformatico>IAREST-2026</sum:IdSistemaInformatico>
            <sum:Version>2.0</sum:Version>
            <sum:NumeroInstalacion>CLOUD</sum:NumeroInstalacion>
            <sum:TipoUsoPosibleSoloVerifactu>S</sum:TipoUsoPosibleSoloVerifactu>
            <sum:TipoUsoPosibleMultiOT>N</sum:TipoUsoPosibleMultiOT>
            <sum:IndicadorMultiplesOT>N</sum:IndicadorMultiplesOT>
          </sum:SistemaInformatico>
          <sum:FechaHoraHusoGenRegistro>${f.fecha_expedicion}</sum:FechaHoraHusoGenRegistro>
          <sum:HuellaRegistro>${f.huella}</sum:HuellaRegistro>
        </sum:RegistroAlta>
      </sum:RegistroFactura>
    </sum:RegFactuSistemaFacturacion>
  </soapenv:Body>
</soapenv:Envelope>`
}

// ── Estado de conformidad VeriFactu ──────────────────────────

export const VERIFACTU_STATUS = {
  phase: 1,
  conforme: true,
  descripcion: 'Sistema conforme RD 1007/2023 — Hash SHA-256 encadenado + QR AEAT',
  envio_aeat: 'pendiente_activacion_aeat',
  fecha_obligatoria_sociedades: '2026-01-01',
  fecha_obligatoria_autonomos:  '2026-07-01',
  nota: 'El envío SOAP/XML a la AEAT está preparado. La AEAT habilitará la recepción ~2027.',
} as const
