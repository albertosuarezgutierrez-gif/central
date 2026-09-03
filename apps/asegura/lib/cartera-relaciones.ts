// Relaciones entre clientes (`seguros.cliente_relaciones`) y la AUTORIZACIÓN
// para ver los seguros del otro. Reglas puras en `@central/module-seguros`
// (relaciones.ts); aquí solo BD, con `correduriaId` explícito en todo.
//
// Forma de la tabla (heredada del CRM): DOS filas por vínculo, una por
// sentido. Fila A→B: `tipo` = «B es <tipo> de A»; `puedeVerPolizas` = «A
// autoriza a B a ver las pólizas de A». La autorización se da SIEMPRE desde
// la ficha de quien autoriza (A): es su consentimiento, no el del otro.

import {
  clientesVisiblesPara,
  permiteAutorizar,
  relacionesDeFicha,
  tipoInverso,
  tipoRelacion,
  type RelacionFicha,
  type RelacionFila,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

export type RelacionCartera = RelacionFicha & {
  nombre: string
  tipoCliente: string
  /** Pólizas vivas (de CIMA) del relacionado. `null` = no se pudo contar. */
  polizasVivas: number | null
}

type Fallo = { ok: false; estado: 'invalido' | 'conflicto' | 'no_encontrado' | 'error'; motivo: string; status: 404 | 409 | 422 | 500 }

async function filasDe(correduriaId: string, clienteId: string): Promise<RelacionFila[]> {
  const db = prismaAsegura()
  const filas = await db.clienteRelacion.findMany({
    where: { correduriaId, OR: [{ clienteAId: clienteId }, { clienteBId: clienteId }] },
    orderBy: { createdAt: 'asc' },
  })
  return filas.map((f) => ({
    id: f.id,
    clienteAId: f.clienteAId,
    clienteBId: f.clienteBId,
    tipo: f.tipoRelacion,
    puedeVerPolizas: f.puedeVerPolizas,
    observaciones: f.observaciones,
  }))
}

/** Las relaciones de una ficha con nombre y pólizas vivas del otro. `null` = no se pudo consultar. */
export async function listarRelaciones(correduriaId: string, clienteId: string): Promise<RelacionCartera[] | null> {
  try {
    const db = prismaAsegura()
    const rel = relacionesDeFicha(await filasDe(correduriaId, clienteId), clienteId)
    if (rel.length === 0) return []
    const ids = rel.map((r) => r.relacionadoId)
    const otros = await db.cliente.findMany({
      where: { id: { in: ids }, correduriaId },
      select: { id: true, nombre: true, apellidos: true, tipo: true, mergedIntoClienteId: true },
    })
    const vivas = await db.poliza.groupBy({
      by: ['clienteId'],
      where: { clienteId: { in: ids }, correduriaId, importRef: null, mergedIntoPolizaId: null },
      _count: { _all: true },
    })
    const nVivas = new Map(vivas.map((v) => [v.clienteId, v._count._all]))
    const porId = new Map(otros.map((o) => [o.id, o]))
    return rel
      .map((r): RelacionCartera | null => {
        const o = porId.get(r.relacionadoId)
        if (!o) return null
        // Una lápida de fusión: el vínculo sigue en la ficha superviviente, aquí no se pinta.
        if (o.mergedIntoClienteId) return null
        return {
          ...r,
          nombre: `${o.nombre} ${o.apellidos}`.trim(),
          tipoCliente: String(o.tipo),
          polizasVivas: nVivas.get(o.id) ?? 0,
        }
      })
      .filter((r): r is RelacionCartera => r !== null)
  } catch {
    return null
  }
}

/** Para un portal: ids de clientes cuyas pólizas puede ver `clienteId`. `null` = no se pudo consultar. */
export async function clientesQuePuedeVer(correduriaId: string, clienteId: string): Promise<string[] | null> {
  try {
    return clientesVisiblesPara(await filasDe(correduriaId, clienteId), clienteId)
  } catch {
    return null
  }
}

export type ResultadoRelacion = { ok: true; relaciones: RelacionCartera[] } | Fallo

async function ambosDeLaCorreduria(correduriaId: string, a: string, b: string): Promise<boolean> {
  const n = await prismaAsegura().cliente.count({ where: { id: { in: [a, b] }, correduriaId, mergedIntoClienteId: null } })
  return n === 2
}

async function devolver(correduriaId: string, clienteId: string): Promise<ResultadoRelacion> {
  const relaciones = await listarRelaciones(correduriaId, clienteId)
  if (relaciones === null) return { ok: false, estado: 'error', motivo: 'No se pudieron releer las relaciones.', status: 500 }
  return { ok: true, relaciones }
}

/** Crea el vínculo en los DOS sentidos (tipo y su inverso). */
export async function crearRelacion(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; tipo: unknown; observaciones?: unknown; actor: string },
): Promise<ResultadoRelacion> {
  const tipo = tipoRelacion(entrada.tipo)
  if (!tipo) return { ok: false, estado: 'invalido', motivo: 'Tipo de relación desconocido.', status: 422 }
  if (entrada.relacionadoId === clienteId) return { ok: false, estado: 'invalido', motivo: 'Un cliente no se relaciona consigo mismo.', status: 422 }
  try {
    if (!(await ambosDeLaCorreduria(correduriaId, clienteId, entrada.relacionadoId))) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Alguna de las dos fichas no existe en esta correduría.', status: 404 }
    }
    const db = prismaAsegura()
    const ya = await db.clienteRelacion.count({
      where: { correduriaId, OR: [{ clienteAId: clienteId, clienteBId: entrada.relacionadoId }, { clienteAId: entrada.relacionadoId, clienteBId: clienteId }] },
    })
    if (ya > 0) return { ok: false, estado: 'conflicto', motivo: 'Esas dos fichas ya están relacionadas: edita o borra el vínculo que hay.', status: 409 }
    const obs = typeof entrada.observaciones === 'string' && entrada.observaciones.trim() !== '' ? entrada.observaciones.trim().slice(0, 500) : null
    await db.$transaction([
      db.clienteRelacion.create({ data: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId, tipoRelacion: tipo, observaciones: obs } }),
      db.clienteRelacion.create({ data: { correduriaId, clienteAId: entrada.relacionadoId, clienteBId: clienteId, tipoRelacion: tipoInverso(tipo), observaciones: obs } }),
    ])
    await anotar(correduriaId, clienteId, `Relación añadida desde plataforma por ${entrada.actor}: ${tipo} (ficha ${entrada.relacionadoId})`)
    await anotar(correduriaId, entrada.relacionadoId, `Relación añadida desde plataforma por ${entrada.actor}: ${tipoInverso(tipo)} (ficha ${clienteId})`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/**
 * `clienteId` AUTORIZA (o revoca) a `relacionadoId` a ver sus pólizas. Se
 * escribe en la fila ida (clienteId→relacionadoId); si el volcado solo trajo
 * la vuelta, se crea la ida con el tipo inverso. Queda en el historial de los
 * dos: es un consentimiento, y se tiene que poder ver quién lo dio y cuándo.
 */
export async function autorizarVer(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; autoriza: boolean; actor: string },
): Promise<ResultadoRelacion> {
  try {
    if (!(await ambosDeLaCorreduria(correduriaId, clienteId, entrada.relacionadoId))) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Alguna de las dos fichas no existe en esta correduría.', status: 404 }
    }
    const db = prismaAsegura()
    const idas = await db.clienteRelacion.findMany({ where: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId } })
    // «Sin vínculo» = revisado y no son nada el uno del otro. Autorizar ahí sería
    // abrir las pólizas de la ficha a quien solo conduce su coche. Se corta aquí,
    // no solo escondiendo el botón: el puerto es lo que escribe el consentimiento.
    if (entrada.autoriza && idas.some((i) => !permiteAutorizar(i.tipoRelacion))) {
      return { ok: false, estado: 'invalido', motivo: 'Ese vínculo está anotado como «Sin vínculo»: para autorizar a ver las pólizas hace falta antes una relación de verdad.', status: 422 }
    }
    if (idas.length > 0) {
      await db.clienteRelacion.updateMany({ where: { id: { in: idas.map((i) => i.id) } }, data: { puedeVerPolizas: entrada.autoriza } })
    } else {
      const vuelta = await db.clienteRelacion.findFirst({ where: { correduriaId, clienteAId: entrada.relacionadoId, clienteBId: clienteId } })
      if (!vuelta) return { ok: false, estado: 'no_encontrado', motivo: 'Esas fichas no están relacionadas: añade primero la relación.', status: 404 }
      await db.clienteRelacion.create({
        data: { correduriaId, clienteAId: clienteId, clienteBId: entrada.relacionadoId, tipoRelacion: tipoInverso(vuelta.tipoRelacion), puedeVerPolizas: entrada.autoriza },
      })
    }
    const verbo = entrada.autoriza ? 'AUTORIZA' : 'REVOCA la autorización a'
    await anotar(correduriaId, clienteId, `${verbo} la ficha ${entrada.relacionadoId} a ver sus pólizas — anotado desde plataforma por ${entrada.actor}`)
    await anotar(correduriaId, entrada.relacionadoId, `La ficha ${clienteId} ${entrada.autoriza ? 'le autoriza' : 'le retira la autorización'} a ver sus pólizas — anotado desde plataforma por ${entrada.actor}`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Borra el vínculo entero (los dos sentidos). */
export async function borrarRelacion(
  correduriaId: string,
  clienteId: string,
  entrada: { relacionadoId: string; actor: string },
): Promise<ResultadoRelacion> {
  try {
    const db = prismaAsegura()
    const r = await db.clienteRelacion.deleteMany({
      where: { correduriaId, OR: [{ clienteAId: clienteId, clienteBId: entrada.relacionadoId }, { clienteAId: entrada.relacionadoId, clienteBId: clienteId }] },
    })
    if (r.count === 0) return { ok: false, estado: 'no_encontrado', motivo: 'No había ningún vínculo entre esas fichas.', status: 404 }
    await anotar(correduriaId, clienteId, `Relación con la ficha ${entrada.relacionadoId} borrada desde plataforma por ${entrada.actor}`)
    return devolver(correduriaId, clienteId)
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-relaciones] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
