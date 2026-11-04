// QR tributario VeriFactu: URL del servicio de cotejo de la AEAT. Lógica PURA.
//
// Orden HAC/1177/2024, art. 21 y especificación AEAT «Características del QR y especificaciones del servicio
// de cotejo»: URL `…/wlpl/TIKE-CONT/ValidarQR` (sistemas VERI*FACTU) o `…/ValidarQRNoVerifactu` (resto),
// con los parámetros en este orden: nif, numserie, fecha (dd-mm-aaaa) e importe (ImporteTotal, punto decimal).
// Los valores van codificados como componente de URL (RFC 3986): un `&` o `/` en el número de serie no rompe
// la consulta. El PNG del QR (ISO/IEC 18004, nivel M, 30-40 mm) lo pinta quien imprime; aquí solo el contenido.

import { centimosAImporte, fechaAeat, ErrorVerifactu } from './importe.ts'

export type EntornoAeat = 'produccion' | 'pruebas'

const BASE_QR: Record<EntornoAeat, string> = {
  produccion: 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT',
  pruebas:    'https://prewww2.aeat.es/wlpl/TIKE-CONT',
}

export interface DatosQr {
  nif:                  string
  numSerie:             string
  fechaExpedicion:      string   // AAAA-MM-DD
  importeTotalCentimos: number
  /** true (por defecto) = sistema VERI*FACTU (remite a la AEAT); false = sistema no VERI*FACTU. */
  verifactu?:           boolean
  entorno?:             EntornoAeat
}

/** Contenido del QR: URL de cotejo de la factura en la sede de la AEAT. */
export function urlQrCotejo(d: DatosQr): string {
  const nif = d.nif.trim()
  const numSerie = d.numSerie.trim()
  if (!nif || !numSerie) throw new ErrorVerifactu('QR: nif y numSerie son obligatorios')
  const ruta = d.verifactu === false ? 'ValidarQRNoVerifactu' : 'ValidarQR'
  const params: [string, string][] = [
    ['nif', nif],
    ['numserie', numSerie],
    ['fecha', fechaAeat(d.fechaExpedicion)],
    ['importe', centimosAImporte(d.importeTotalCentimos, 'importeTotalCentimos')],
  ]
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${BASE_QR[d.entorno ?? 'produccion']}/${ruta}?${qs}`
}

/** Leyenda que acompaña al QR en la factura de un sistema VERI*FACTU (art. 20 Orden HAC/1177/2024). */
export const LEYENDA_VERIFACTU = 'Factura verificable en la sede electrónica de la AEAT'
