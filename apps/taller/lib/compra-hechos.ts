// Albarán valorado con la factura del proveedor → «hecho contable» de COMPRA del puerto de `@central/module-contabilidad`. PURO.
// SOLO el puerto: se encola en el outbox (lib/hechos-outbox.ts) al valorar; las cuentas las decide el núcleo con sus reglas. Si el
// albarán no se puede representar (falta IVA de alguna línea, sin importes), NO se inventa: queda `no_soportado` con su motivo.
import type { HechoCompra } from '@central/module-contabilidad'
import { cuotaIvaCent, importeStockCent, type UnidadStock } from '@central/module-taller'
import type { ResultadoHecho } from './factura-hechos.ts'

export interface LineaCompra { cantidad: number; unidad: UnidadStock; costeUnitarioCent: number | null; ivaPuntosBasicos: number | null }
export interface AlbaranParaHecho {
  albaranId: string
  proveedorNombre: string
  numeroAlbaran: string
  facturaNumero: string
  facturaFecha: string // AAAA-MM-DD
  matricula: string | null
  lineas: readonly LineaCompra[]
}

/** Desglose por tipo de IVA: base = suma de importes de línea; cuota calculada sobre la base del grupo (un redondeo por grupo). */
export function hechoCompra(a: AlbaranParaHecho): ResultadoHecho<HechoCompra> {
  if (a.lineas.length === 0) return { ok: false, motivo: 'albarán sin líneas' }
  const grupos = new Map<number, number>()
  for (const l of a.lineas) {
    if (l.costeUnitarioCent == null) return { ok: false, motivo: 'hay líneas del albarán sin valorar' }
    if (l.ivaPuntosBasicos == null) return { ok: false, motivo: 'hay líneas sin tipo de IVA: asígnalo al artículo para contabilizar la compra' }
    grupos.set(l.ivaPuntosBasicos, (grupos.get(l.ivaPuntosBasicos) ?? 0) + importeStockCent(l.cantidad, l.costeUnitarioCent, l.unidad))
  }
  return {
    ok: true,
    hecho: {
      tipo: 'compra', fecha: a.facturaFecha, ref: `albaran:${a.albaranId}`, documento: a.facturaNumero,
      concepto: `Compra ${a.proveedorNombre} · factura ${a.facturaNumero} (albarán ${a.numeroAlbaran})`,
      ...(a.matricula ? { dimensiones: { matricula: a.matricula } } : {}),
      desglose: [...grupos.entries()].sort((x, y) => x[0] - y[0]).map(([pb, base]) => ({ base, tipoIva: pb / 100, cuota: cuotaIvaCent(base, pb) })),
    },
  }
}
