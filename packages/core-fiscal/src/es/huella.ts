// Huella (hash) de los registros de facturación VeriFactu. Lógica PURA.
//
// Fuente: AEAT, «Detalle de las especificaciones técnicas para generación de la huella o hash de los registros
// de facturación» (v0.1.2, 27/08/2024), desarrollo del art. 13 de la Orden HAC/1177/2024.
//   - Cadena `campo=valor` unidos por `&`, en el ORDEN fijo de cada tipo de registro.
//   - Valores sin espacios al principio ni al final; si un valor está vacío se escribe `campo=` igualmente
//     (el primer registro de la cadena lleva `Huella=`).
//   - Codificación UTF-8, SHA-256, hexadecimal en MAYÚSCULAS (64 caracteres). TipoHuella = 01.
//   - Los valores deben ser EXACTAMENTE los que van en el XML (12.35 ≠ 12.350): por eso aquí entran ya
//     formateados por los mismos helpers que usa el XML.
// Conformidad: test/verifactu.test.ts reproduce los 3 ejemplos con huella resultante de ese documento.

import crypto from 'node:crypto'

export const TIPO_HUELLA_SHA256 = '01'

/** Campos de la huella de un registro de ALTA, ya en formato AEAT. */
export interface CamposHuellaAlta {
  IDEmisorFactura:          string
  NumSerieFactura:          string
  FechaExpedicionFactura:   string   // dd-mm-aaaa
  TipoFactura:              string
  CuotaTotal:               string   // «12.35»
  ImporteTotal:             string   // «123.45»
  /** Huella del registro anterior de la cadena (alta o anulación); '' en el primer registro. */
  Huella:                   string
  FechaHoraHusoGenRegistro: string   // AAAA-MM-DDThh:mm:ss±hh:mm
}

/** Campos de la huella de un registro de ANULACIÓN, ya en formato AEAT. */
export interface CamposHuellaAnulacion {
  IDEmisorFacturaAnulada:        string
  NumSerieFacturaAnulada:        string
  FechaExpedicionFacturaAnulada: string   // dd-mm-aaaa
  Huella:                        string   // huella del registro anterior; '' si es el primero
  FechaHoraHusoGenRegistro:      string
}

const ORDEN_ALTA: (keyof CamposHuellaAlta)[] = [
  'IDEmisorFactura', 'NumSerieFactura', 'FechaExpedicionFactura', 'TipoFactura',
  'CuotaTotal', 'ImporteTotal', 'Huella', 'FechaHoraHusoGenRegistro',
]
const ORDEN_ANULACION: (keyof CamposHuellaAnulacion)[] = [
  'IDEmisorFacturaAnulada', 'NumSerieFacturaAnulada', 'FechaExpedicionFacturaAnulada',
  'Huella', 'FechaHoraHusoGenRegistro',
]

function cadena<T extends object>(campos: T, orden: (keyof T)[]): string {
  return orden.map(k => `${String(k)}=${String(campos[k] ?? '').trim()}`).join('&')
}

function sha256Mayus(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase()
}

/** Cadena exacta que se hashea en un registro de alta (útil para auditoría y depuración). */
export function cadenaHuellaAlta(c: CamposHuellaAlta): string {
  return cadena(c, ORDEN_ALTA)
}
/** Cadena exacta que se hashea en un registro de anulación. */
export function cadenaHuellaAnulacion(c: CamposHuellaAnulacion): string {
  return cadena(c, ORDEN_ANULACION)
}

/** Huella SHA-256 (hex MAYÚSCULAS) de un registro de alta. */
export function huellaAlta(c: CamposHuellaAlta): string {
  return sha256Mayus(cadenaHuellaAlta(c))
}
/** Huella SHA-256 (hex MAYÚSCULAS) de un registro de anulación. */
export function huellaAnulacion(c: CamposHuellaAnulacion): string {
  return sha256Mayus(cadenaHuellaAnulacion(c))
}

const RE_HUELLA = /^[0-9A-F]{64}$/
export function esHuellaValida(h: unknown): h is string {
  return typeof h === 'string' && RE_HUELLA.test(h)
}
