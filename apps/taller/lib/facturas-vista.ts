/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural */
// Lectura de UNA factura para pantalla e impresión (dentro de conTaller). Solo lectura.
import type { GrupoIva } from '@central/module-taller'
import { CONFIG_SIF } from './sistema-informatico.ts'
import type { FacturaImprimible } from './factura-html.ts'
import type { TxFacturas } from './facturas.ts'

type TxVista = Pick<TxFacturas, 'factura' | 'facturaLinea' | 'cobro' | 'taller' | 'registroVerifactu'> & { configuracion: { findFirst(a: any): Promise<any> } }
const iso = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export type FacturaVista = Omit<FacturaImprimible, 'qrDataUrl'> & {
  id: string; otId: string; pendienteCent: number | null; rectificativas: { id: string; numSerie: string }[]
  registros: { tipo: string; secuencia: number; estadoEnvio: string }[]
}

export async function cargarFacturaVista(tx: TxVista, tallerId: string, id: string): Promise<FacturaVista | null> {
  const f = await tx.factura.findFirst({ where: { tallerId, id } })
  if (!f) return null
  const [lineas, cobros, taller, cfg, original, rects, registros] = await Promise.all([
    tx.facturaLinea.findMany({ where: { tallerId, facturaId: id }, orderBy: { orden: 'asc' } }),
    tx.cobro.findMany({ where: { tallerId, facturaId: id }, orderBy: { cobradoEn: 'asc' } }),
    tx.taller.findFirst({ where: { id: tallerId } }),
    tx.configuracion.findFirst({ where: { tallerId } }),
    f.rectificadaId ? tx.factura.findFirst({ where: { tallerId, id: f.rectificadaId } }) : Promise.resolve(null),
    tx.factura.findMany({ where: { tallerId, rectificadaId: id } }),
    tx.registroVerifactu.findMany({ where: { tallerId, facturaId: id }, orderBy: { secuencia: 'asc' } }),
  ])
  const total = Number(f.totalCent)
  const cobrado = cobros.reduce((s, c) => s + Number(c.importeCent), 0)
  return {
    id: f.id, otId: f.otId, numSerie: f.numSerie, tipo: f.tipo, fechaExpedicion: iso(f.fechaExpedicion),
    emisor: { razon: f.emisorRazonSocial, nif: f.emisorNif, domicilio: f.emisorDomicilio ?? null, nombreComercial: taller?.nombreComercial ?? null },
    cliente: { nombre: f.clienteNombre ?? null, nif: f.clienteNif ?? null, domicilio: f.clienteDomicilio ?? null },
    rectifica: original ? { numSerie: original.numSerie, modo: f.tipoRectificativa ?? null, motivo: f.motivoRectificacion ?? null } : null,
    lineas: lineas.map((l) => ({ descripcion: l.descripcion, cantidad: Number(l.cantidad), unidad: l.unidad, baseCent: Number(l.baseCent), ivaPuntosBasicos: Number(l.ivaPuntosBasicos) })),
    desglose: f.desgloseIva as GrupoIva[],
    baseCent: Number(f.baseCent), cuotaIvaCent: Number(f.cuotaIvaCent), totalCent: total,
    huella: f.huella, qrUrl: f.qrUrl, verifactu: CONFIG_SIF.verifactu, estado: f.estado, estadoEnvio: f.estadoEnvio,
    pie: cfg?.textoPieFactura ?? '',
    cobros: cobros.map((c) => ({ fecha: iso(c.cobradoEn), medio: c.medioCodigo, importeCent: Number(c.importeCent) })),
    pendienteCent: f.estado === 'anulada' || total <= 0 ? null : total - cobrado,
    rectificativas: rects.map((r) => ({ id: r.id, numSerie: r.numSerie })),
    registros: registros.map((r) => ({ tipo: r.tipo, secuencia: Number(r.secuencia), estadoEnvio: r.estadoEnvio })),
  }
}
