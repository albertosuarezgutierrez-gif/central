// PATRIMONIO (22/10/2026, pasos 7-8) — cuerpos TRANSACCIONALES de las facturas, sin prisma ni sesión (el `tx` entra por
// parámetro con la forma mínima de `documentos-tx.ts`), para probar con un `tx` falso el ORDEN de las sentencias y el
// traslado del documento al confirmar con otro inmueble. Sin SQL nuevo: solo columnas con GRANT.
import { createHash } from 'node:crypto'

import { crearDocumentoTx, type TxMin } from './documentos-tx.ts'
import type { DatosConfirmacion } from './facturas-api.ts'

const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)

/** Tope diario de facturas ATÓMICO: bloqueo por identidad → recuento → fila `propuesto` (+ documento del inmueble). */
export async function reservarConTope(
  tx: TxMin,
  x: {
    identidadId: string
    titularId: string
    inmuebleId: string | null
    carpetaFacturas: string
    fichero: { nombre: string; mime: string; contenido: Buffer }
    desde: Date
    fechaMarcador: string
    max: number
    propuestaInicial: unknown
  },
): Promise<{ ok: true; id: string; documentoId: string | null } | { ok: false; motivo: 'tope' }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`portal-factura:${x.identidadId}`}, 0))`
  const hoy = await tx.portalPatrimonioGasto.count({ where: { creadoPorIdentidadId: x.identidadId, origen: 'factura', creadoEn: { gte: x.desde } } })
  if (hoy >= x.max) return { ok: false, motivo: 'tope' }
  const g = await tx.portalPatrimonioGasto.create({
    data: {
      titularId: x.titularId,
      inmuebleId: x.inmuebleId,
      // `fecha` es NOT NULL: hoy es solo un marcador (la verdad leída irá en `propuesta.leido.fecha`).
      fecha: aFecha(x.fechaMarcador),
      estado: 'propuesto',
      origen: 'factura',
      propuesta: x.propuestaInicial,
      creadoPorIdentidadId: x.identidadId,
    },
    select: { id: true },
  })
  // El fichero se guarda como documento del inmueble EN LA MISMA transacción (todo o nada). Sin inmueble no hay owner.
  let documentoId: string | null = null
  if (x.inmuebleId !== null) {
    documentoId = await crearDocumentoTx(tx, {
      titularId: x.titularId,
      identidadId: x.identidadId,
      owner: { tipo: 'inmueble', id: x.inmuebleId },
      carpeta: x.carpetaFacturas,
      nombre: x.fichero.nombre,
      mime: x.fichero.mime,
      sha256: createHash('sha256').update(x.fichero.contenido).digest('hex'),
      contenido: x.fichero.contenido,
    })
    await tx.portalPatrimonioGasto.updateMany({ where: { id: g.id, titularId: x.titularId }, data: { documentoId } })
  }
  return { ok: true, id: g.id, documentoId }
}

/** Otra confirmación (o un descarte) se adelantó dentro de la transacción: se deshace TODO y el llamador responde `ya_resuelto`. */
export class ConfirmacionAdelantada extends Error {}

/**
 * Confirma el gasto. Si se confirma con OTRO inmueble del mismo titular y la factura tenía documento, el documento (inmutable
 * por trigger) se COPIA en el inmueble nuevo, el viejo se sella `borrado_en` y el gasto se repunta al nuevo, todo en la misma
 * transacción. «Sin inmueble» (`inmuebleId` null) deja el documento donde estaba. El inmueble ya viene validado dentro del titular.
 */
export async function confirmarGasto(
  tx: TxMin,
  x: { titularId: string; identidadId: string; gastoId: string; datos: DatosConfirmacion; ahora: Date },
): Promise<'ok' | 'no_encontrado' | 'ya_resuelto'> {
  const donde = { id: x.gastoId, titularId: x.titularId, origen: 'factura' }
  const g = await tx.portalPatrimonioGasto.findFirst({ where: donde, select: { estado: true, inmuebleId: true, documentoId: true, propuesta: true } })
  if (!g) return 'no_encontrado'
  if (g.estado !== 'propuesto') return 'ya_resuelto'

  const documentoActual = (g.documentoId as string | null) ?? null
  let documentoNuevo: string | null = null
  const destino = x.datos.inmuebleId
  if (destino !== null && documentoActual !== null && destino !== g.inmuebleId) {
    const viejo = await tx.portalPatrimonioDocumento.findFirst({
      where: { id: documentoActual, titularId: x.titularId, borradoEn: null },
      select: { carpeta: true, nombre: true, mime: true, sha256: true, contenido: true },
    })
    if (viejo) {
      const nuevoId = await crearDocumentoTx(tx, {
        titularId: x.titularId,
        identidadId: x.identidadId,
        owner: { tipo: 'inmueble', id: destino },
        carpeta: viejo.carpeta as string,
        nombre: viejo.nombre as string,
        mime: viejo.mime as string,
        sha256: viejo.sha256 as string,
        contenido: Buffer.from(viejo.contenido as Uint8Array),
      })
      const sello = await tx.portalPatrimonioDocumento.updateMany({
        where: { id: documentoActual, titularId: x.titularId, borradoEn: null },
        data: { borradoEn: x.ahora, borradoPorIdentidadId: x.identidadId },
      })
      if (sello.count !== 1) throw new ConfirmacionAdelantada()
      documentoNuevo = nuevoId
    }
  }

  // IVA y retención no tienen columna: se guardan en `propuesta.confirmado` (jsonb) junto a lo leído, sin pisarlo.
  const base = g.propuesta && typeof g.propuesta === 'object' && !Array.isArray(g.propuesta) ? (g.propuesta as Record<string, unknown>) : {}
  const propuesta = { ...base, confirmado: { ivaCent: x.datos.ivaCent, retencionCent: x.datos.retencionCent } }
  const r = await tx.portalPatrimonioGasto.updateMany({
    where: { ...donde, estado: 'propuesto' },
    data: {
      // «Sin inmueble» DESASIGNA el de la subida (el gasto no se imputa a un inmueble que la persona ha quitado).
      inmuebleId: x.datos.inmuebleId,
      ...(documentoNuevo === null ? {} : { documentoId: documentoNuevo }),
      fecha: aFecha(x.datos.fecha),
      categoria: x.datos.categoria,
      concepto: x.datos.concepto,
      baseCent: x.datos.baseCent === null ? null : BigInt(x.datos.baseCent),
      totalCent: BigInt(x.datos.totalCent),
      propuesta,
      estado: 'confirmado',
      confirmadoEn: x.ahora,
      confirmadoPorIdentidadId: x.identidadId,
    },
  })
  if (r.count !== 1) throw new ConfirmacionAdelantada()
  return 'ok'
}
