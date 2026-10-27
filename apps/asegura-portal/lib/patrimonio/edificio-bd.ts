// EDIFICIO SIN DIVISIÓN HORIZONTAL (27/10/2026) — adaptador con BD de `edificio-api.ts` (unidad suelta y reparto).
//
// 🚨 Parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`): el edificio del id de la URL se busca DENTRO de
// los titulares autorizados y vivos; las unidades, DENTRO de ese edificio y de su titular. La unidad nace con el `titularId`
// del EDIFICIO (nunca del cuerpo) y la BD lo cierra otra vez con la FK compuesta `(inmueble_padre_id, titular_id)`.
import { Prisma } from '@prisma/client'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import type { AccesosMapa, EdificioAutorizado, PuertosEdificio } from './edificio-api'
import { decimal } from './lectura'

async function edificioAutorizado(identidadId: string, id: string, accesos: AccesosMapa): Promise<EdificioAutorizado | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const fila = await prisma.portalPatrimonioInmueble.findFirst({
    where: { id, titular: { clienteId: { in: [...accesos.keys()] }, archivadoEn: null } },
    select: { id: true, titularId: true, uso: true, inmueblePadreId: true, archivadoEn: true, titular: { select: { clienteId: true } } },
  })
  if (!fila) return null
  const unidades = await prisma.portalPatrimonioInmueble.findMany({
    where: { inmueblePadreId: fila.id, titularId: fila.titularId, archivadoEn: null },
    select: { id: true, alias: true, superficieM2: true, repartoPorcentaje: true },
    orderBy: { alias: 'asc' },
  })
  return {
    id: fila.id,
    clienteId: fila.titular.clienteId,
    titularId: fila.titularId,
    uso: fila.uso,
    inmueblePadreId: fila.inmueblePadreId,
    archivado: fila.archivadoEn !== null,
    unidades: unidades.map((u) => ({ id: u.id, alias: u.alias, superficieM2: decimal(u.superficieM2), repartoPorcentaje: decimal(u.repartoPorcentaje) })),
  }
}

export function puertosEdificio(identidadId: string): PuertosEdificio {
  let cache: AccesosMapa | null = null
  return {
    accesos: async () => (cache ??= await accesosPatrimonio(identidadId)),
    edificio: (id, accesos) => edificioAutorizado(identidadId, id, accesos),
    async crearUnidad({ edificio, alias, uso, superficieM2 }) {
      // Dirección y comunidad se HEREDAN del edificio; la referencia catastral NO se copia (se hereda al leer: una sola RC).
      const ed = await prisma.portalPatrimonioInmueble.findFirstOrThrow({
        where: { id: edificio.id, titularId: edificio.titularId },
        select: { cp: true, municipioIne: true, via: true, numero: true, resto: true, direccionNormalizada: true, enComunidad: true },
      })
      const u = await prisma.portalPatrimonioInmueble.create({
        data: {
          titularId: edificio.titularId,
          inmueblePadreId: edificio.id,
          alias,
          uso,
          superficieM2: superficieM2 === null ? null : new Prisma.Decimal(superficieM2),
          ...ed,
          creadoPorIdentidadId: identidadId,
        },
        select: { id: true },
      })
      return { id: u.id }
    },
    async guardarReparto({ edificio, criterio, unidades }) {
      await prisma.$transaction([
        prisma.portalPatrimonioInmueble.updateMany({
          where: { id: edificio.id, titularId: edificio.titularId, uso: 'edificio', inmueblePadreId: null, archivadoEn: null },
          data: { repartoCriterio: criterio },
        }),
        ...unidades.map((u) =>
          prisma.portalPatrimonioInmueble.updateMany({
            // Dentro del edificio y de su titular: un id ajeno no casa con ninguna fila.
            where: { id: u.id, inmueblePadreId: edificio.id, titularId: edificio.titularId, archivadoEn: null },
            data: {
              superficieM2: u.superficieM2 === null ? null : new Prisma.Decimal(u.superficieM2),
              repartoPorcentaje: u.porcentaje === null ? null : new Prisma.Decimal(u.porcentaje),
            },
          }),
        ),
      ])
    },
  }
}
