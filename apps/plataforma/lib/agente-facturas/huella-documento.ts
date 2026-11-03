// Huella ESTABLE del DOCUMENTO (correo+adjunto, archivo o factura). Módulo PURO.
//
// 🚨 Por qué existe (03/11/2026). `fingerprint()` (fingerprint.ts) es la huella del PROVEEDOR: sale de
// NIF o nombre. Una foto de WhatsApp sin proveedor ni NIF legibles daba `''`, y entonces:
//   · `existeDuplicado` salta su rama por huella (`fingerprint <> ''`),
//   · `mismoGastoPorHuella` devuelve false (sin proveedor ni NIF en ambos no compara),
// y como el listado de Gmail re-lee la ventana de 36 h cada día, el mismo adjunto entraba dos veces
// (644,81 € ×2, 02/11 y 03/11). La huella de documento cierra ese hueco sin fundir facturas distintas.
//
// Claves por orden de fuerza:
//   1. id del mensaje de Gmail + nombre del adjunto      → `msg:`
//   2. hash del contenido del archivo                    → `file:`
//   3. proveedor|nif|nº factura|fecha|total normalizado  → `fac:` (exige nº de factura y proveedor/NIF)
//   4. fecha + total + nombre ORIGINAL del archivo       → `arch:` (último recurso; los tres a la vez)
// Sin ninguna clave suficiente devuelve '' y quien la use NO compara con nada (nunca por fecha+total solos).

import { createHash } from 'node:crypto'
import { normalizaNif, normalizaProveedor } from './fingerprint.ts'

export const PREFIJOS_HUELLA_DOC = ['msg:', 'file:', 'fac:', 'arch:'] as const

export interface EntradaHuellaDoc {
  /** Message-ID de Gmail del correo del que sale el adjunto. */
  messageId?: string | null
  /** Nombre ORIGINAL del adjunto/archivo. */
  nombreArchivo?: string | null
  /** SHA-256 hex del contenido (ver `hashContenido`). */
  hashContenido?: string | null
  proveedor?: string | null
  nif_proveedor?: string | null
  numero_factura?: string | null
  /** YYYY-MM-DD */
  fecha?: string | null
  total?: number | null
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32)

export function hashContenido(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

function nombreNorm(n?: string | null): string {
  return (n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function totalNorm(t?: number | null): string {
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t.toFixed(2) : ''
}

function fechaNorm(f?: string | null): string {
  const s = String(f ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** Huella del documento, o '' si no hay clave suficiente (entonces NO se compara con nada). */
export function huellaDocumento(e: EntradaHuellaDoc): string {
  const msg = (e.messageId ?? '').trim()
  const nombre = nombreNorm(e.nombreArchivo)
  if (msg && nombre) return `msg:${sha(`${msg}|${nombre}`)}`

  const h = (e.hashContenido ?? '').trim().toLowerCase()
  if (h) return `file:${h.slice(0, 32)}`

  const numero = (e.numero_factura ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const quien = normalizaNif(e.nif_proveedor) || normalizaProveedor(e.proveedor ?? '')
  const fecha = fechaNorm(e.fecha)
  const total = totalNorm(e.total)
  if (numero && quien && fecha && total) return `fac:${sha(`${quien}|${numero}|${fecha}|${total}`)}`

  // Último recurso: fecha, total y nombre original a la vez. Sin el nombre no se funde nada.
  if (nombre && fecha && total) return `arch:${sha(`${nombre}|${fecha}|${total}`)}`

  return ''
}

/** ¿Es una huella de documento (y no la del proveedor)? */
export function esHuellaDocumento(fp?: string | null): boolean {
  return !!fp && PREFIJOS_HUELLA_DOC.some((p) => fp.startsWith(p))
}

/**
 * ¿Ya hay un gasto vivo con esa huella de documento? Vacía = no se compara con nada.
 * `existentes` = huellas de gastos NO descartados.
 */
export function yaImputadoPorDocumento(huella: string, existentes: readonly (string | null | undefined)[]): boolean {
  if (!huella) return false
  return existentes.some((f) => f === huella)
}
