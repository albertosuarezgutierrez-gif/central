// ¿Quién es el tomador de un documento y está ya en la cartera? (27/09/2026, asistente de Telegram)
//
// «Su DNI no aparece» NO es «no está»: medido ese día, 6.582 de 31.816 fichas tienen DNI pero no
// `dni_lookup_hash` (volcado histórico), así que la búsqueda por DNI no las ve —y el alta, que comprueba
// duplicados con la misma búsqueda, tampoco lo frenaría—. Por eso, además del DNI, se busca por NOMBRE:
// lo que salga son `posibles` y decide Alberto. El DNI no sale de aquí: viaja solo dentro del sello.
import { prepararAltaDesdeDocumento, type LecturaPoliza } from '@central/module-seguros'
import { computeDniLookupHash } from '@central/module-seguros-pii'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { correduriaUnica } from './cartera'
import { coincidencias } from './cartera-edicion'
import { sellarAltaLead } from './sello-alta-lead'
import { palabrasNombre } from './palabras-nombre'

export type FichaTomador = { id: string; nombre: string; tipo: string; activo: boolean }
export type Tomador = {
  nombre: string | null
  conDni: boolean
  /** Fichas con ese DNI. `null` = no se ha podido buscar (sin DNI, sin hash o fallo) — ≠ `[]`. */
  coincidencias: FichaTomador[] | null
  /** Fichas cuyo nombre contiene todas las palabras del tomador. `null` = no se ha podido buscar. */
  posibles: FichaTomador[] | null
  sello: string | null
}

export async function tomadorDe(l: LecturaPoliza): Promise<Tomador> {
  const { alta } = prepararAltaDesdeDocumento(l)
  if (!alta) return { nombre: null, conDni: false, coincidencias: null, posibles: null, sello: null }
  const nombre = `${alta.nombre} ${alta.apellidos}`.trim()
  const c = await correduriaUnica().catch(() => null)
  const db = prismaAsegura()
  const activos = async (ids: string[]) => {
    if (ids.length === 0) return new Map<string, boolean>()
    const filas = await db.cliente.findMany({ where: { id: { in: ids } }, select: { id: true, activo: true } })
    return new Map(filas.map((f) => [f.id, f.activo]))
  }

  let porDni: FichaTomador[] | null = null
  if (c && alta.dni && computeDniLookupHash(alta.dni)) {
    try {
      const cs = await coincidencias(c.id, { dni: alta.dni })
      const act = await activos(cs.map((x) => x.id))
      porDni = cs.map(({ id, nombre: n, tipo }) => ({ id, nombre: n, tipo, activo: act.get(id) ?? true }))
    } catch {
      porDni = null
    }
  }

  let posibles: FichaTomador[] | null = null
  const palabras = palabrasNombre(nombre)
  if (c && palabras.length >= 2) {
    try {
      const conds = palabras.map((p) => Prisma.sql`translate(lower(nombre || ' ' || apellidos), 'áéíóúüàèìòù', 'aeiouuaeiou') LIKE ${`%${p}%`}`)
      const filas = await db.$queryRaw<{ id: string; nombre: string; tipo: string; activo: boolean }[]>`
        select id::text as id, trim(nombre || ' ' || apellidos) as nombre, tipo::text as tipo, activo
        from clientes
        where correduria_id = ${c.id}::uuid and merged_into_cliente_id is null and ${Prisma.join(conds, ' and ')}
        limit 6`
      const ya = new Set((porDni ?? []).map((x) => x.id))
      posibles = filas.filter((f) => !ya.has(f.id))
    } catch {
      posibles = null
    }
  }

  let sello: string | null = null
  try { sello = sellarAltaLead(alta) } catch { sello = null }
  return { nombre, conDni: alta.dni !== null, coincidencias: porDni, posibles, sello }
}
