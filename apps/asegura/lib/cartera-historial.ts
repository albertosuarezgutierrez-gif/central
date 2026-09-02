// Lectura del historial de una ficha (`seguros.historial_interno`) y detección
// de pólizas duplicadas en la cartera viva. Solo lectura; `correduriaId`
// explícito en todo. `null` = no se pudo consultar, nunca `[]`.

import { polizasDuplicadas, type GrupoDuplicado } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export type HistorialFila = { id: string; tipo: string; texto: string; fecha: string }

/** Últimas 50 anotaciones de la ficha, la más reciente primero. `null` = no se pudo leer. */
export async function historialCliente(correduriaId: string, clienteId: string, limite = 50): Promise<HistorialFila[] | null> {
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string; tipo: string; texto: string; created_at: Date }[]>`
      select id, tipo::text as tipo, texto, created_at
      from historial_interno
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid and deleted_at is null
      order by created_at desc
      limit ${limite}`
    return filas.map((f) => ({ id: f.id, tipo: f.tipo, texto: f.texto, fecha: f.created_at.toISOString() }))
  } catch {
    return null
  }
}

/**
 * Cotizaciones vivas de un cliente (pendiente/enviada, últimos `dias` días).
 * Es lo que convierte a un lead en «con presupuesto». `null` = no se pudo contar.
 */
export async function cotizacionesVivas(correduriaId: string, clienteId: string, dias: number): Promise<number | null> {
  try {
    const r = await prismaAsegura().$queryRaw<{ n: bigint }[]>`
      select count(*)::bigint as n
      from cotizaciones
      where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid
        and estado::text in ('pendiente', 'enviada')
        and created_at >= now() - make_interval(days => ${dias}::int)`
    return Number(r[0]?.n ?? 0)
  } catch {
    return null
  }
}

/** Pólizas vivas duplicadas (mismo número + compañía) en toda la correduría. `null` = no se pudo leer. */
export async function duplicadasCartera(correduriaId: string): Promise<GrupoDuplicado[] | null> {
  try {
    const filas = await prismaAsegura().poliza.findMany({
      where: { correduriaId, importRef: null, mergedIntoPolizaId: null },
      select: { id: true, clienteId: true, numeroPoliza: true, codigoEntidadDgs: true, aseguradora: true, idPolizaEntidad: true, estado: true },
    })
    return polizasDuplicadas(
      filas.map((p) => ({
        id: p.id,
        clienteId: p.clienteId,
        numeroPoliza: p.numeroPoliza,
        codigoEntidadDgs: p.codigoEntidadDgs,
        aseguradora: p.aseguradora,
        viva: true,
        confirmadaCima: p.idPolizaEntidad !== null,
        estado: String(p.estado),
      })),
    )
  } catch {
    return null
  }
}
