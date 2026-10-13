import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import {
  bienesDeObligacionesGuardadas,
  DECLARADA_ELIMINADA,
  obligacionesParaRestaurar,
} from '@/lib/declaradas-eliminadas'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * Devolver a la bóveda una póliza aportada que la persona quitó (10/10/2026).
 *
 * Alberto: «lo que el cliente sube puede eliminarlo, pero NADA se pierde: todo queda registrado
 * para poder restaurar si se equivoca». El DELETE no borra (pone `eliminadaEn`); esto lo deshace.
 *
 * 🚨 Aislamiento igual que el PATCH y el DELETE: la identidad sale de la cookie y va DENTRO del
 * `where` del `updateMany`, junto al id de la URL. «No existe», «no es tuya» y «no está eliminada»
 * se responden igual (404): distinguirlas convertiría la ruta en un oráculo de uuids. El modo
 * corredor no llega aquí (`middleware.ts` veta el POST con 403 `modo_corredor`).
 *
 * Al restaurar vuelven también sus OBLIGACIONES (vencimiento, recibo, recordatorios propios), que
 * el DELETE apartó al historial: con los mismos ids y los mismos sellos `avisadaAt`/`avisadaPushAt`,
 * para que restaurar no vuelva a mandar un aviso que ya salió. La identidad y la póliza de cada
 * fila las impone esta ruta, nunca el JSON guardado. Los PARTES no se vuelven a ligar (ver la
 * cabecera del DELETE): una comunicación sellada no se reescribe.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const { id } = await ctx.params

  const resultado = await prisma.$transaction(async (tx) => {
    const eliminada = await tx.portalPolizaDeclarada.findFirst({
      where: { id, identidadId: identidad.id, ...DECLARADA_ELIMINADA },
      select: { id: true, eliminadaEn: true },
    })
    if (!eliminada) return null

    const { count } = await tx.portalPolizaDeclarada.updateMany({
      where: { id, identidadId: identidad.id, ...DECLARADA_ELIMINADA },
      data: { eliminadaEn: null },
    })
    // 0 = otra pestaña la restauró en medio. El resultado que ve la persona es el que quería.
    if (count === 0) return null

    // La ÚLTIMA eliminación de ESTA póliza de ESTA identidad: si la quitó, la restauró y la volvió
    // a quitar, lo que vuelve es lo que tenía la segunda vez.
    const ultima = await tx.portalPolizaDeclaradaHistorial.findFirst({
      where: { polizaId: id, identidadId: identidad.id, accion: 'eliminada' },
      orderBy: { creadoEn: 'desc' },
      select: { antes: true },
    })
    const guardadas =
      ultima?.antes && typeof ultima.antes === 'object' && !Array.isArray(ultima.antes)
        ? (ultima.antes as Record<string, unknown>).obligaciones
        : null

    // Un recordatorio colgado de un bien que ya no es de esta identidad no puede volver con ese
    // bien (FK): vuelve suelto. Se comprueba con la identidad DENTRO del `where`.
    const bienes = bienesDeObligacionesGuardadas(guardadas)
    const bienesValidos = new Set(
      bienes.length === 0
        ? []
        : (
            await tx.portalBien.findMany({
              where: { id: { in: bienes }, identidadId: identidad.id },
              select: { id: true },
            })
          ).map((b) => b.id),
    )
    const filas = obligacionesParaRestaurar(guardadas, {
      identidadId: identidad.id,
      polizaDeclaradaId: id,
      bienesValidos,
    })
    // `skipDuplicates`: si la próxima visita a la bóveda ya derivó otra vez el vencimiento (misma
    // clave identidad+póliza+tipo), gana la que hay; no se rompe la restauración por eso.
    const recuperadas = filas.length === 0 ? 0 : (await tx.portalObligacion.createMany({ data: filas, skipDuplicates: true })).count

    await tx.portalPolizaDeclaradaHistorial.create({
      data: {
        polizaId: id,
        identidadId: identidad.id,
        accion: 'restaurada',
        antes: { eliminadaEn: eliminada.eliminadaEn?.toISOString() ?? null },
        despues: { eliminadaEn: null, obligacionesRecuperadas: recuperadas },
      },
    })
    return { recuperadas }
  })

  if (!resultado) return NextResponse.json({ error: 'no_encontrada' }, { status: 404 })
  return NextResponse.json({ ok: true, obligacionesRecuperadas: resultado.recuperadas })
}
