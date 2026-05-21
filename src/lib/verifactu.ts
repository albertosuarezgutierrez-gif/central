// ============================================================
// ia.rest · VERIFACTU — Hash encadenado RD 1007/2023
// Phase 1: registros locales + QR en ticket ✅
// Phase 2: envío SOAP/XML a AEAT (cuando AEAT lo habilite ~2027)
// ============================================================
// Spec: "Sistemas Informáticos de Facturación v1.0.3" (AEAT, 28/07/2025)
//   Sección 9.1.1 — Encadenamiento de registros de facturación
// ============================================================

import crypto from 'crypto'

// ── Tipos ────────────────────────────────────────────────────

export interface RegistroFactura {
  nif_emisor:       string
  numero_serie:     string
  numero_factura:   number
  fecha_expedicion: string   // ISO 8601 con offset: '2026-05-02T20:14:33+02:00'
  importe_total:    number
  cuota_iva:        number
  huella_anterior:  string | null
}

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

// ── Parseo de fecha LOCAL (CRÍTICO para hash correcto) ───────
// La spec AEAT exige la hora LOCAL del emisor, no UTC.
// new Date(iso).getHours() devuelve UTC en algunos entornos → bug.
// Solución: parsear el string ISO directamente sin conversión.

function parseFechaLocalAEAT(iso: string): string {
  // '2026-05-02T20:14:33+02:00' → '02-05-2026 20:14:33'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) {
    // fallback: fecha actual en Madrid
    const dt = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(dt.getDate())}-${pad(dt.getMonth()+1)}-${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  }
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`
}

// ── Hash SHA-256 (spec AEAT v1.0.3, sección 9.1.1) ──────────
// Campos en orden obligatorio separados por '&':
//   IDEmisorFactura & NumSerieFactura & FechaExpedicion &
//   TipoFactura & CuotaTotal & Encadenamiento

export function calcularHuella(reg: RegistroFactura): string {
  const fechaAEAT = parseFechaLocalAEAT(reg.fecha_expedicion)
  const numSerie = `${reg.numero_serie}-${String(reg.numero_factura).padStart(8, '0')}`

  const cadena = [
    `IDEmisorFactura=${reg.nif_emisor}`,
    `NumSerieFactura=${numSerie}`,
    `FechaExpedicionFacturaEmisor=${fechaAEAT}`,
    `TipoFactura=F2`,
    `CuotaTotal=${reg.importe_total.toFixed(2)}`,
    `Encadenamiento=${reg.huella_anterior ?? '0'}`,
  ].join('&')

  return crypto
    .createHash('sha256')
    .update(cadena, 'utf8')
    .digest('hex')
    .toUpperCase()
}

// ── QR data (formato TIKE-CONT, Orden HAC/1177/2024) ────────

export function generarQrData(params: {
  nif:     string
  serie:   string
  numero:  number
  fecha:   string   // YYYY-MM-DD
  importe: number
}): string {
  const base = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT'
  const qs = new URLSearchParams({
    nif:     params.nif,
    ser:     params.serie,
    nfac:    String(params.numero).padStart(8, '0'),
    fecha:   params.fecha,
    importe: params.importe.toFixed(2),
  })
  return `${base}?${qs.toString()}`
}

// ── Cálculo fiscal ────────────────────────────────────────────

export function calcularFiscal(importeConIva: number, tipoIva = 10): {
  base_imponible: number
  cuota_iva:      number
  tipo_iva:       number
} {
  const base = importeConIva / (1 + tipoIva / 100)
  return {
    base_imponible: Math.round(base * 100) / 100,
    cuota_iva:      Math.round((importeConIva - base) * 100) / 100,
    tipo_iva:       tipoIva,
  }
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
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
