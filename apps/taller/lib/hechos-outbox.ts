/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// OUTBOX hacia contabilidad. El hecho se inserta en la MISMA transacción que la factura/cobro (si la factura falla, no queda hecho;
// si la transacción confirma, el hecho existe aunque contabilidad esté caída). Aquí NUNCA hay HTTP: lo envía el cron (enviar-hechos).
// Idempotente por (taller, tipo, ref): encolar dos veces lo mismo no duplica (misma clave que el puerto de contabilidad).
import { hechoCompra, type AlbaranParaHecho } from './compra-hechos.ts'
import { hechoCobro, hechoVenta, type CobroParaHecho, type FacturaParaHecho } from './factura-hechos.ts'

type Delegado = { findFirst(a?: any): Promise<any>; create(a: any): Promise<any> }
export type TxOutbox = { hechoPendiente: Delegado }

export const ESTADOS_HECHO = ['pendiente', 'enviado', 'rechazado', 'error', 'no_soportado'] as const
export type EstadoHecho = (typeof ESTADOS_HECHO)[number]

async function insertar(
  tx: TxOutbox, o: { tallerId: string; facturaId: string | null; tipo: 'venta' | 'cobro' | 'compra' | 'no_soportado'; ref: string; hecho: unknown },
): Promise<void> {
  const ya = await tx.hechoPendiente.findFirst({ where: { tallerId: o.tallerId, tipo: o.tipo, ref: o.ref } })
  if (ya) return
  await tx.hechoPendiente.create({
    data: {
      tallerId: o.tallerId, facturaId: o.facturaId, tipo: o.tipo, ref: o.ref, hecho: o.hecho,
      estado: o.tipo === 'no_soportado' ? 'no_soportado' : 'pendiente', intentos: 0,
    },
  })
}

/** Anota algo que el puerto contable aún no representa (abonos, sustituciones, anulaciones): visible, NO se envía. */
export function encolarNoSoportado(tx: TxOutbox, o: { tallerId: string; facturaId: string | null; ref: string; motivo: string }): Promise<void> {
  return insertar(tx, { tallerId: o.tallerId, facturaId: o.facturaId, tipo: 'no_soportado', ref: o.ref, hecho: { motivo: o.motivo } })
}

/** La factura emitida → hecho de venta (o «no soportado» con su motivo). */
export async function encolarFactura(tx: TxOutbox, o: { tallerId: string; facturaId: string; factura: FacturaParaHecho }): Promise<void> {
  const h = hechoVenta(o.factura)
  if (!h.ok) return encolarNoSoportado(tx, { tallerId: o.tallerId, facturaId: o.facturaId, ref: o.factura.numSerie, motivo: h.motivo })
  return insertar(tx, { tallerId: o.tallerId, facturaId: o.facturaId, tipo: 'venta', ref: h.hecho.ref, hecho: h.hecho })
}

/** Un cobro registrado → hecho de cobro. La ref es el id del cobro (estable). */
export async function encolarCobro(tx: TxOutbox, o: { tallerId: string; facturaId: string; cobro: CobroParaHecho }): Promise<void> {
  const h = hechoCobro(o.cobro)
  if (!h.ok) return encolarNoSoportado(tx, { tallerId: o.tallerId, facturaId: o.facturaId, ref: `cobro:${o.cobro.id}`, motivo: h.motivo })
  return insertar(tx, { tallerId: o.tallerId, facturaId: o.facturaId, tipo: 'cobro', ref: h.hecho.ref, hecho: h.hecho })
}

/** Anulación VeriFactu: no hay hecho de «contraasiento» en el puerto; queda anotado como no soportado. */
export function encolarAnulacion(tx: TxOutbox, o: { tallerId: string; facturaId: string; numSerie: string }): Promise<void> {
  return encolarNoSoportado(tx, {
    tallerId: o.tallerId, facturaId: o.facturaId, ref: `anulacion:${o.numSerie}`,
    motivo: `anulación de ${o.numSerie}: el puerto contable aún no admite contraasientos (se anotará a mano en contabilidad)`,
  })
}

/** Albarán valorado con la factura del proveedor → hecho de compra (sin factura de venta asociada). Idempotente por `albaran:<id>`. */
export async function encolarCompra(tx: TxOutbox, o: { tallerId: string; albaran: AlbaranParaHecho }): Promise<void> {
  const h = hechoCompra(o.albaran)
  if (!h.ok) return encolarNoSoportado(tx, { tallerId: o.tallerId, facturaId: null, ref: `compra:albaran:${o.albaran.albaranId}`, motivo: h.motivo })
  return insertar(tx, { tallerId: o.tallerId, facturaId: null, tipo: 'compra', ref: h.hecho.ref, hecho: h.hecho })
}
