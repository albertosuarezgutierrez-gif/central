// PATRIMONIO (22/10/2026) — adaptador con BD de las pantallas de titulares e inmuebles (paso 5).
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); el titular, el inmueble o el
// id de la URL NUNCA consultan por sí solos: se buscan DENTRO de lo autorizado. Sin RLS, un `where` de menos devuelve
// el patrimonio de cualquiera. Los puertos de `inmuebles-api.ts` no ven prisma.
import { Prisma } from '@prisma/client'
import { puede } from '@central/module-patrimonio'

import { prisma } from '../db'
import { accesosPatrimonio } from './accesos'
import type { AccesosMapa, PuertosInmuebles, TitularLista } from './inmuebles-api'
import { calleSinValidar, inmuebleDeFila, type FilaInmueble } from './lectura'
import { getIdentidad } from '../session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const nombreDe = (f: { nombre: string; apellidos: string | null }) => `${f.nombre} ${f.apellidos ?? ''}`.trim()

/** Los titulares que ve esta identidad, con sus inmuebles (sin archivados). */
async function listarTitulares(identidadId: string, ids: readonly string[], accesos: AccesosMapa): Promise<TitularLista[]> {
  // `ids` salen de `accesosPatrimonio(identidadId)` (ver `puertosInmuebles`).
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (`accesosPatrimonio` ya lo exige).
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return []
  const [fichas, titulares, vinculos] = await Promise.all([
    prisma.cliente.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nombre: true, apellidos: true } }),
    prisma.portalPatrimonioTitular.findMany({
      where: { clienteId: { in: [...ids] }, archivadoEn: null },
      select: {
        clienteId: true,
        inmuebles: { where: { archivadoEn: null }, orderBy: { alias: 'asc' } },
      },
    }),
    // Cuáles de esas fichas son las TUYAS (vínculo de esta identidad): el resto las ves por Dueño o por autorización.
    prisma.portalVinculo.findMany({ where: { identidadId, origen: { not: 'corredor' } }, select: { clienteId: true } }),
  ])
  const propias = new Set(vinculos.map((v) => v.clienteId))
  const inmueblesDe = new Map(titulares.map((t) => [t.clienteId, t.inmuebles]))
  return fichas
    .map((f): TitularLista => {
      const nivel = accesos.get(f.id)!
      return {
        clienteId: f.id,
        nombre: nombreDe(f),
        nivel,
        propio: propias.has(f.id),
        puedeAlta: puede(nivel, 'alta_baja'),
        inmuebles: (inmueblesDe.get(f.id) ?? []).map((i) => {
          const m = inmuebleDeFila(i as FilaInmueble)
          return { id: m.id, alias: m.alias, uso: m.uso, direccion: m.direccion, calleSinValidar: calleSinValidar(i), superficieM2: m.superficieM2 }
        }),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function puertosInmuebles(identidadId: string): PuertosInmuebles {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  return {
    accesos,
    listar: (ids, acc) => listarTitulares(identidadId, ids, acc),
    async crear({ clienteId, datos }) {
      // `clienteId` ya viene validado contra `accesos()` por el handler; aquí solo se lee su ficha.
      const ficha = await prisma.cliente.findFirst({
        where: { id: clienteId, mergedIntoClienteId: null, activo: true },
        select: { id: true, correduriaId: true, tipoPersona: true },
      })
      if (!ficha) return { ok: false, motivo: 'duplicado' }
      // El titular nace la primera vez que se da de alta algo; correduría y tipo salen de la FICHA, nunca del cuerpo.
      const titular =
        (await prisma.portalPatrimonioTitular.findUnique({ where: { clienteId }, select: { id: true, archivadoEn: true } })) ??
        (await prisma.portalPatrimonioTitular.create({
          data: {
            clienteId,
            correduriaId: ficha.correduriaId,
            tipo: ficha.tipoPersona === 'juridica' ? 'sociedad' : 'persona',
            creadoPorIdentidadId: identidadId,
          },
          select: { id: true, archivadoEn: true },
        }))
      if (titular.archivadoEn !== null) return { ok: false, motivo: 'duplicado' }
      try {
        const i = await prisma.portalPatrimonioInmueble.create({
          data: {
            titularId: titular.id,
            alias: datos.alias,
            uso: datos.uso,
            referenciaCatastral: datos.referenciaCatastral,
            cp: datos.cp,
            via: datos.via,
            numero: datos.numero,
            resto: datos.resto,
            direccionNormalizada: datos.direccionNormalizada,
            enComunidad: datos.enComunidad,
            creadoPorIdentidadId: identidadId,
          },
          select: { id: true },
        })
        return { ok: true, id: i.id }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, motivo: 'duplicado' }
        throw e
      }
    },
  }
}

/** Para la página de la lista. Vacío = esta identidad no tiene patrimonio (la página lo dice). */
export async function patrimonioDeIdentidad(identidadId: string): Promise<TitularLista[]> {
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return []
  return listarTitulares(identidadId, [...accesos.keys()], accesos)
}

export type FichaInmueble = {
  inmueble: ReturnType<typeof inmuebleDeFila>
  /** La ficha del titular (clave de `accesosPatrimonio`): las rutas de documentos lo piden como `titular`. */
  clienteId: string
  titularNombre: string
  nivel: 'gestion' | 'total'
  valorReconstruccionCent: number | null
  /** Inmueble archivado: histórico del cliente, SOLO LECTURA (la página no ofrece altas ni ediciones). */
  archivado: boolean
  /** `true` = «calle por validar»; `null` = sin dirección. */
  calleSinValidar: boolean | null
}

/**
 * El inmueble del id de la URL SOLO si cuelga de un titular autorizado. `null` = 404 (no existe o no es tuyo).
 * Un inmueble ARCHIVADO se devuelve con `archivado: true` (solo lectura); el titular archivado sigue siendo 404.
 */
export async function inmuebleAutorizado(identidadId: string, idPedido: string): Promise<FichaInmueble | null> {
  if (!UUID.test(idPedido)) return null
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return null
  const fila = await prisma.portalPatrimonioInmueble.findFirst({
    where: { id: idPedido, titular: { clienteId: { in: [...accesos.keys()] }, archivadoEn: null } },
    include: { titular: { select: { clienteId: true } } },
  })
  if (!fila) return null
  const nivel = accesos.get(fila.titular.clienteId)
  if (!nivel) return null
  const ficha = await prisma.cliente.findUnique({ where: { id: fila.titular.clienteId }, select: { nombre: true, apellidos: true } })
  return {
    inmueble: inmuebleDeFila(fila as FilaInmueble),
    clienteId: fila.titular.clienteId,
    titularNombre: ficha ? nombreDe(ficha) : '',
    nivel,
    valorReconstruccionCent: fila.valorReconstruccionEstimadoCent === null ? null : Number(fila.valorReconstruccionEstimadoCent),
    archivado: fila.archivadoEn !== null,
    calleSinValidar: calleSinValidar(fila),
  }
}
