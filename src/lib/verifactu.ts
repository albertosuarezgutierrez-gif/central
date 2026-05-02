// ============================================================
// ia.rest · VERIFACTU — Hash encadenado RD 1007/2023
// Phase 1: registros locales + QR en ticket
// Phase 2 (antes 01/01/2027): envío SOAP/XML a AEAT
// ============================================================
// Spec: "Sistemas Informáticos de Facturación v1.0.3" (AEAT, 28/07/2025)
//   Sección 9.1.1 — Encadenamiento de registros de facturación
// ============================================================

import crypto from 'crypto'

// ── Tipos ────────────────────────────────────────────────────

export interface RegistroFactura {
  nif_emisor:       string   // NIF del emisor (restaurante)
  numero_serie:     string   // ej: 'T'
  numero_factura:   number
  fecha_expedicion: string   // ISO 8601, ej: '2026-05-02T20:14:33+02:00'
  importe_total:    number
  cuota_iva:        number
  huella_anterior:  string | null  // null → primer registro de la serie
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

// ── Hash SHA-256 (spec AEAT v1.0.3, sección 9.1.1) ──────────
//
// Concatenación ordenada de campos obligatorios separados por '&',
// seguida de SHA-256 en UTF-8, resultado en HEX MAYÚSCULAS.
//
// Campos en orden:
//   IDEmisorFactura & NumSerieFactura & FechaExpedicion &
//   TipoFactura & CuotaTotal & Encadenamiento
//
// TipoFactura F2 = factura simplificada (ticket de hostelería)
// Encadenamiento = huella anterior o '0' si es el primer registro

export function calcularHuella(reg: RegistroFactura): string {
  // Fecha en formato DD-MM-YYYY HH:MM:SS (spec AEAT)
  const dt = new Date(reg.fecha_expedicion)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fechaAEAT = [
    pad(dt.getDate()), pad(dt.getMonth() + 1), dt.getFullYear()
  ].join('-') + ' ' + [
    pad(dt.getHours()), pad(dt.getMinutes()), pad(dt.getSeconds())
  ].join(':')

  const cadena = [
    `IDEmisorFactura=${reg.nif_emisor}`,
    `NumSerieFactura=${reg.numero_serie}-${String(reg.numero_factura).padStart(8, '0')}`,
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
//
// URL de verificación que imprime en el ticket.
// El cliente puede escanearlo y ver la factura en la sede AEAT.

export function generarQrData(params: {
  nif:    string
  serie:  string
  numero: number
  fecha:  string   // YYYY-MM-DD
  importe: number
}): string {
  const base = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT'
  const qs = new URLSearchParams({
    nif:    params.nif,
    ser:    params.serie,
    nfac:   String(params.numero).padStart(8, '0'),
    fecha:  params.fecha,
    importe: params.importe.toFixed(2),
  })
  return `${base}?${qs.toString()}`
}

// ── Cálculo fiscal ────────────────────────────────────────────
// Hostelería española: IVA reducido 10% sobre la mayoría de servicios
// Excepciones: bebidas alcohólicas 21%, pero en ticket simplificado
// se usa un tipo medio / único. Fase 1: 10% unificado.

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
  const fecha_iso = ahora.toISOString()
  const fecha_yyyy_mm_dd = ahora.toISOString().slice(0, 10)
  const tipo_iva = params.tipo_iva ?? 10
  const { base_imponible, cuota_iva } = calcularFiscal(params.importe_total, tipo_iva)

  const reg: RegistroFactura = {
    nif_emisor:       params.nif_emisor,
    numero_serie:     params.numero_serie,
    numero_factura:   params.numero_factura,
    fecha_expedicion: fecha_iso,
    importe_total:    params.importe_total,
    cuota_iva,
    huella_anterior:  params.huella_anterior,
  }

  const huella = calcularHuella(reg)
  const qr_data = generarQrData({
    nif:     params.nif_emisor,
    serie:   params.numero_serie,
    numero:  params.numero_factura,
    fecha:   fecha_yyyy_mm_dd,
    importe: params.importe_total,
  })

  return {
    numero_serie:     params.numero_serie,
    numero_factura:   params.numero_factura,
    fecha_expedicion: fecha_iso,
    razon_social:     params.razon_social,
    nif_emisor:       params.nif_emisor,
    importe_total:    params.importe_total,
    base_imponible,
    cuota_iva,
    tipo_iva,
    huella,
    huella_anterior:  params.huella_anterior,
    primer_registro:  params.primer_registro,
    qr_data,
    comanda_id:       params.comanda_id,
    mesa_label:       params.mesa_label,
    num_items:        params.num_items,
  }
}
