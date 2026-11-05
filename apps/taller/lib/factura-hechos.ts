// Factura/cobro del taller → «hecho contable» del puerto de `@central/module-contabilidad` (submódulo partida). PURO.
// Se encola en el outbox (lib/hechos-outbox.ts) en la misma transacción y lo envía el cron. El taller dice QUÉ pasó;
// las cuentas las decide el núcleo con sus reglas (aquí no se nombra ninguna cuenta del PGC).
import { esMedioPago, type HechoCobro, type HechoVenta, type MedioPago } from '@central/module-contabilidad'
import type { GrupoIva } from '@central/module-taller'

export type ResultadoHecho<H> = { ok: true; hecho: H } | { ok: false; motivo: string }

export interface FacturaParaHecho {
  numSerie: string
  fechaExpedicion: string // AAAA-MM-DD
  tipo: string
  desglose: readonly GrupoIva[]
  clienteNombre: string | null
  /** 'S' (sustitución) / 'I' (diferencias) / null si no es rectificativa. */
  tipoRectificativa?: string | null
}

/** Venta = la factura emitida (desglose por tipo de IVA). Las rectificativas en negativo aún no son representables. */
export function hechoVenta(f: FacturaParaHecho): ResultadoHecho<HechoVenta> {
  // Una rectificativa por SUSTITUCIÓN reemplaza a la original (no suma): como «venta» duplicaría el ingreso. No se inventa.
  if (f.tipoRectificativa === 'S') {
    return { ok: false, motivo: 'rectificativa por sustitución: el puerto contable aún no admite sustituir una venta ya asentada' }
  }
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

export interface CobroParaHecho { id: string; fecha: string; importeCent: number; medioCodigo: string; numSerie: string; esEfectivo?: boolean }

/** Cobro de una factura. El medio va en el concepto; la cuenta de tesorería la decide la regla del núcleo. */
/** `medio` = código del medio (efectivo, bizum, transferencia, tarjeta…): contabilidad decide 570 (efectivo) o 572 (resto). */
export type HechoCobroConMedio = HechoCobro & { medio: MedioPago }
/** El puerto solo admite 5 medios: efectivo (por flag o código), un código conocido, o «otro» (los códigos propios del taller). */
export function medioDelPuerto(codigo: string, esEfectivo?: boolean): MedioPago {
  if (esEfectivo === true) return 'efectivo'
  return esMedioPago(codigo) ? codigo : 'otro'
}
export function hechoCobro(c: CobroParaHecho): ResultadoHecho<HechoCobroConMedio> {
  if (!Number.isSafeInteger(c.importeCent) || c.importeCent <= 0) return { ok: false, motivo: 'importe de cobro inválido' }
  return {
    ok: true,
    hecho: { tipo: 'cobro', fecha: c.fecha, ref: c.id, documento: c.numSerie, importe: c.importeCent, medio: medioDelPuerto(c.medioCodigo, c.esEfectivo), concepto: `Cobro ${c.numSerie} (${c.medioCodigo})` },
  }
}
