// Quién es, en la CARTERA, la persona que hay detrás de una identidad del portal.
//
// Vivía dentro de `partes-portal.ts` y sale de ahí el 07/09/2026, al aparecer la
// segunda pantalla que necesita la misma respuesta (los leads de
// `leads-portal.ts`). No es una limpieza estética: la decisión sobre los
// vínculos MÚLTIPLES —cuál se elige y qué se avisa— tiene que ser UNA. Con dos
// copias, el día que una cambie las dos pantallas dirán cosas distintas sobre la
// misma persona y nada fallará.
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'

type FilaVinculo = { identidad_id: string; cliente_id: string }

/**
 * `portal_vinculo` de esta correduría para esas identidades → ficha de la cartera.
 *
 * ⚠️ Decisión sobre los vínculos MÚLTIPLES (una identidad casada con dos fichas):
 * se devuelve **el más antiguo** (`creado_en`, y el `id` como desempate para que
 * el resultado no dependa del orden en que la BD devuelva las filas) y se deja
 * constancia en el log del servidor. No se adivina «la buena» y tampoco se
 * devuelve `null`: `null` significa en toda esta capa «no lo hemos casado con
 * nadie», y usarlo aquí borraría la diferencia entre no saber quién es y saberlo
 * de más — que se arreglan en sitios distintos (identificar a la persona vs.
 * fusionar dos fichas). El vínculo extra sí queda dicho, en el log, con ids y sin
 * un solo dato personal.
 */
export async function vinculosPorIdentidad(
  correduriaId: string,
  identidadIds: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (identidadIds.length === 0) return mapa
  const filas = await prismaAsegura().$queryRaw<FilaVinculo[]>`
    select identidad_id, cliente_id
    from portal_vinculo
    where correduria_id = ${correduriaId}::uuid
      and identidad_id in (${Prisma.join(identidadIds.map((i) => Prisma.sql`${i}::uuid`))})
    order by identidad_id, creado_en asc, id asc`
  for (const f of filas) {
    const ya = mapa.get(f.identidad_id)
    if (ya === undefined) mapa.set(f.identidad_id, f.cliente_id)
    else if (ya !== f.cliente_id) {
      console.warn(
        `[vinculos-portal] identidad ${f.identidad_id} vinculada a más de una ficha ` +
          `(${ya} y ${f.cliente_id}); se usa la más antigua. Puede ser una fusión pendiente.`,
      )
    }
  }
  return mapa
}

/** Las identidades vinculadas a una ficha. Lista vacía = esa ficha no tiene a nadie en el portal. */
export async function identidadesDeCliente(correduriaId: string, clienteId: string): Promise<string[]> {
  const filas = await prismaAsegura().$queryRaw<{ identidad_id: string }[]>`
    select identidad_id
    from portal_vinculo
    where correduria_id = ${correduriaId}::uuid and cliente_id = ${clienteId}::uuid`
  return [...new Set(filas.map((f) => f.identidad_id))]
}
