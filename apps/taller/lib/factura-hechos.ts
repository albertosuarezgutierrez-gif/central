// Factura/cobro del taller → «hecho contable» del puerto de `@central/module-contabilidad` (submódulo partida). PURO.
// Aún NO se envía a ningún sitio: queda listo para cuando exista `apps/contabilidad` (F2 del módulo). El taller dice QUÉ pasó;
// las cuentas las decide el núcleo con sus reglas (aquí no se nombra ninguna cuenta del PGC).
import type { HechoCobro, HechoVenta } from '@central/module-contabilidad'
import type { GrupoIva } from '@central/module-taller'

export type ResultadoHecho<H> = { ok: true; hecho: H } | { ok: false; motivo: string }

export interface FacturaParaHecho {
  numSerie: string
  fechaExpedicion: string // AAAA-MM-DD
  tipo: string
  desglose: readonly GrupoIva[]
  clienteNombre: string | null
}

/** Venta = la factura emitida (desglose por tipo de IVA). Las rectificativas en negativo aún no son representables. */
export function hechoVenta(f: FacturaParaHecho): ResultadoHecho<HechoVenta> {
  if (f.desglose.some((g) => g.baseCent < 0 || g.cuotaCent < 0)) {
    return { ok: false, motivo: 'rectificativa con importes negativos: el puerto contable aún no admite abonos (se asentará con su contraasiento)' }
  }
  return {
    ok: true,
    hecho: {
      tipo: 'venta', fecha: f.fechaExpedicion, ref: f.numSerie, documento: f.numSerie,
      concepto: `Factura ${f.numSerie}${f.clienteNombre ? ` · ${f.clienteNombre}` : ''}`,
      desglose: f.desglose.map((g) => ({ base: g.baseCent, tipoIva: g.ivaPuntosBasicos / 100, cuota: g.cuotaCent })),
    },
  }
}

export interface CobroParaHecho { id: string; fecha: string; importeCent: number; medioCodigo: string; numSerie: string }

/** Cobro de una factura. El medio va en el concepto; la cuenta de tesorería la decide la regla del núcleo. */
export function hechoCobro(c: CobroParaHecho): ResultadoHecho<HechoCobro> {
  if (!Number.isSafeInteger(c.importeCent) || c.importeCent <= 0) return { ok: false, motivo: 'importe de cobro inválido' }
  return {
    ok: true,
    hecho: { tipo: 'cobro', fecha: c.fecha, ref: c.id, documento: c.numSerie, importe: c.importeCent, concepto: `Cobro ${c.numSerie} (${c.medioCodigo})` },
  }
}
