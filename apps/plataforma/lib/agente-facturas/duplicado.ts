// ¿Es el mismo gasto? Dedupe por HUELLA cuando el número de factura no basta. Módulo PURO.
//
// Duplicados reales vistos en `gastos`: Occident 2.032,71 vs 2.032,72 el mismo día; Fundación 120 ×2
// el mismo día; 307,11 ×2 con proveedor NULL vs con nombre. El dedupe por `numero_factura` no los
// veía (no traían número, o uno sí y otro no).
//
// Regla: proveedor compatible + importe ±0,02 € + fecha ±3 días, PERO solo si no hay dos números
// distintos: dos facturas con números distintos son distintas aunque coincidan importe y proveedor
// (Anthropic 170 € con nº distintos son legítimas). Sin número en alguno de los dos, o el MISMO
// número en ambos, se compara por huella.

import { normalizaProveedor, normalizaNif } from './fingerprint.ts'

export interface GastoHuella {
  proveedor?: string | null
  nif_proveedor?: string | null
  numero_factura?: string | null
  /** YYYY-MM-DD */
  fecha: string
  total: number
}

export const TOLERANCIA_IMPORTE = 0.02
export const TOLERANCIA_DIAS = 3

const MS_DIA = 86_400_000

function dias(fecha: string): number {
  return Math.floor(Date.parse(String(fecha).slice(0, 10) + 'T00:00:00Z') / MS_DIA)
}

function numeroNorm(n?: string | null): string {
  return (n ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function mismoGastoPorHuella(a: GastoHuella, b: GastoHuella): boolean {
  const na = numeroNorm(a.numero_factura)
  const nb = numeroNorm(b.numero_factura)
  // Dos números distintos = dos facturas distintas. Es la única vía que cierra la puerta del todo.
  if (na && nb && na !== nb) return false

  // Proveedor ausente en uno = «no se sabe», no «distinto» (caso 307,11 NULL vs nombre).
  const pa = normalizaProveedor(a.proveedor ?? '')
  const pb = normalizaProveedor(b.proveedor ?? '')
  const nifA = normalizaNif(a.nif_proveedor)
  const nifB = normalizaNif(b.nif_proveedor)
  const mismoNif = !!nifA && nifA === nifB
  const nifsDistintos = !!nifA && !!nifB && nifA !== nifB
  if (nifsDistintos) return false
  const proveedorCompatible = !pa || !pb || pa === pb || mismoNif
  if (!proveedorCompatible) return false

  const da = dias(a.fecha)
  const db = dias(b.fecha)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false
  if (Math.abs(da - db) > TOLERANCIA_DIAS) return false

  // +1e-9: 2032.72 - 2032.70 en coma flotante no debe romper el borde.
  return Math.abs(a.total - b.total) <= TOLERANCIA_IMPORTE + 1e-9
}
