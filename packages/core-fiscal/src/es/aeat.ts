// España — AEAT VeriFactu (RD 1007/2023). Primitivas PURAS reutilizables.
// Spec: "Sistemas Informáticos de Facturación v1.0.3" (AEAT), secc. 9.1.1.
// Lo específico de cada emisor (SistemaInformatico, identidad, now()/huso) NO
// vive aquí: eso es el adaptador en cada app. Aquí solo lógica pura.

import crypto from 'node:crypto'

export interface RegistroFactura {
  nif_emisor:       string
  numero_serie:     string
  numero_factura:   number
  fecha_expedicion: string   // ISO 8601 con offset: '2026-05-02T20:14:33+02:00'
  importe_total:    number
  cuota_iva:        number
  huella_anterior:  string | null
}

/**
 * Pasa el ISO con offset a la fecha LOCAL del emisor en formato AEAT
 * (`dd-mm-yyyy hh:mm:ss`). CRÍTICO: la spec exige hora LOCAL, no UTC, así que
 * se parsea el string directamente sin `new Date()` (que devolvería UTC).
 */
export function parseFechaLocalAEAT(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) {
    const dt = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  }
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`
}

/**
 * Huella SHA-256 encadenada (AEAT v1.0.3, secc. 9.1.1). Campos en orden
 * obligatorio separados por `&`. Devuelve hex en mayúsculas.
 */
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

  return crypto.createHash('sha256').update(cadena, 'utf8').digest('hex').toUpperCase()
}

/** URL del QR de la factura (formato TIKE-CONT, Orden HAC/1177/2024). */
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
