/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// ENTREGA del vehículo (OT terminado → entregado) con la firma de retirada. Siempre dentro de `conTaller`.
//
// Guarda la firma en Storage (`<taller>/<ot>/firma-entrega-<huella>.png`) y, en la OT, `entregado_en` (lo pone `cambiarEstadoOt`), el
// texto EXACTO de conformidad que firmó, su versión y el nombre de quien retira. Si el taller desactivó la firma, se entrega sin ella
// (y solo se anota quién retira, si se dio). Si Storage falla, la excepción deshace TODA la transacción: no queda «entregado» sin firma.
//
// En la misma pantalla el recepcionista puede poner o corregir el VENCIMIENTO DEL SEGURO del vehículo (`vehiculos.seguro_hasta`,
// traza «entrega»). Se valida ANTES de entregar: una fecha mala no deja la OT entregada a medias. Vacío = no se toca.
import { cambioVencimientoSeguro, validarRetirada, validarVencimientoSeguro, type ConfigTaller } from '@central/module-taller'
import type { AlmacenArchivos } from './almacen.ts'
import { cambiarEstadoOt, type ResultadoOrden, type TxOrdenes } from './ordenes.ts'

export const MAX_FIRMA_BYTES = 1024 * 1024

type DelegadoVehiculo = { findFirst(a?: unknown): Promise<any>; update(a: unknown): Promise<any> }
export type TxEntrega = TxOrdenes & { vehiculo: DelegadoVehiculo }

export type EntradaEntrega = {
  tallerId: string
  otId: string
  ahora: Date
  /** Quien retira el vehículo y su firma (PNG ya validado por tipo real). */
  retira: { nombre: string; firma: { mime: string; bytes: Uint8Array } | null }
  /** Versión del texto que la persona tenía en pantalla al firmar: si el taller lo cambió entre medias, se rechaza. */
  versionTextoVista: string | null
  /** Quien entrega (traza del vencimiento del seguro) y la fecha tecleada (AAAA-MM-DD); vacío/ausente = no se toca. */
  usuarioId?: string | null
  vencimientoSeguro?: string | null
}

export async function entregarOt(
  tx: TxEntrega, almacen: AlmacenArchivos, config: ConfigTaller, e: EntradaEntrega,
): Promise<ResultadoOrden> {
  const nombre = e.retira.nombre.trim()
  const errores = validarRetirada(config.retirada, { nombre, tieneFirma: e.retira.firma !== null })
  if (errores.length > 0) return { ok: false, motivo: errores.join(' · ') }
  if (e.retira.firma && e.versionTextoVista !== config.retirada.versionTextoConformidad) {
    return { ok: false, motivo: 'El texto de conformidad ha cambiado mientras firmaba. Vuélvalo a leer y firme de nuevo' }
  }
  const vence = validarVencimientoSeguro(e.vencimientoSeguro ?? null, e.ahora)
  if (!vence.ok) return { ok: false, motivo: vence.motivo }
  const r = await cambiarEstadoOt(tx, { tallerId: e.tallerId, otId: e.otId, hacia: 'entregado', ahora: e.ahora })
  if (!r.ok) return r
  if (vence.fecha) {
    const ot = await tx.ordenTrabajo.findFirst({ where: { tallerId: e.tallerId, id: e.otId }, select: { vehiculoId: true } })
    const veh = ot?.vehiculoId ? await tx.vehiculo.findFirst({ where: { tallerId: e.tallerId, id: ot.vehiculoId } }) : null
    const cambio = veh ? cambioVencimientoSeguro(veh.seguroHasta ?? null, vence.fecha, { usuarioId: e.usuarioId ?? null, origen: 'entrega', ahora: e.ahora }) : null
    if (cambio) await tx.vehiculo.update({ where: { id: veh.id }, data: cambio })
  }
  if (e.retira.firma) {
    const f = await almacen.guardar({ tallerId: e.tallerId, carpeta: e.otId, nombre: 'firma-entrega.png', mime: e.retira.firma.mime, bytes: e.retira.firma.bytes })
    await tx.ordenTrabajo.update({
      where: { id: e.otId },
      data: {
        entregaFirmaRuta: f.ruta, entregaConformidadTexto: config.retirada.textoConformidad,
        entregaConformidadVersion: config.retirada.versionTextoConformidad, entregaRetiraNombre: nombre,
      },
    })
  } else if (nombre) {
    await tx.ordenTrabajo.update({ where: { id: e.otId }, data: { entregaRetiraNombre: nombre } })
  }
  return r
}
