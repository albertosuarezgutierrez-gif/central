// Identidad POR APERTURA de la vista de corredor (02/11/2026, aprobado por Alberto). Aparte de
// `vista-corredor.ts` (que importa Prisma) para poder probarlo sin BD.
//
// 🚨 Antes había UNA identidad compartida (`IDENTIDAD_CORREDOR_ID`) y abrir la ficha B borraba
// el vínculo de A: la pestaña de A se quedaba con la bóveda vacía, o peor, si las dos
// aperturas se cruzaban, la sesión de A (cookie con `corredor.clienteId = A`) pasaba a leer
// la cartera de B, porque las lecturas filtran por IDENTIDAD, no por el claim.
// Ahora cada apertura tiene su identidad: `portal_identidad.id = portal_vista_corredor.id`
// (el enlace consumido), con UN vínculo `origen='corredor'` a SU ficha y a nada más. Dos
// vistas simultáneas no comparten fila ninguna, y nada de lo que hace una toca a la otra.
//
// Sin DDL: el rol ya tiene INSERT/DELETE en `portal_identidad` y `portal_vinculo` (comprobado
// en BD el 02/11/2026), y todas las tablas hijas de `portal_identidad` que una sesión de
// corredor puede llegar a escribir en un GET son `ON DELETE CASCADE`/`SET NULL`.
//
// Limpieza: al salir (`/api/salir`) se borra la identidad de ESA sesión; y en cada apertura se
// borran las de vistas cuya sesión ya caducó (`usado_en` + 4 h). Se reconoce una identidad de
// vista por TRES cosas exactas a la vez: su `nombre` es `NOMBRE_IDENTIDAD_VISTA`, su id es el
// de una fila de `portal_vista_corredor` y no es la identidad compartida antigua. Nunca por
// «no tiene canales» ni por parecido de nombre: una identidad de cliente no se borra jamás.
import { IDENTIDAD_CORREDOR_ID, ORIGEN_VINCULO_CORREDOR, SESION_CORREDOR_SEGUNDOS } from '@central/module-seguros-portal'

/** Marca exacta de una identidad de vista. Solo la escribe este fichero; ningún flujo de cliente escribe `nombre`. */
export const NOMBRE_IDENTIDAD_VISTA = 'Corredor · Grupo ASegura · vista temporal'

/** Cuántas identidades caducadas se barren por apertura (cota: la apertura no puede volverse lenta). */
export const LIMPIEZA_POR_APERTURA = 100

export interface TxIdentidadVista {
  portalIdentidad: {
    create(args: { data: { id: string; nombre: string }; select: { id: true } }): Promise<{ id: string }>
  }
  portalVinculo: {
    create(args: {
      data: { identidadId: string; correduriaId: string; clienteId: string; nivel: 'gestionar'; origen: string }
      select: { id: true }
    }): Promise<{ id: string }>
  }
}

export interface DbLimpiezaVista {
  portalIdentidad: {
    findMany(args: {
      where: { nombre: string; creadaEn: { lt: Date }; id: { not: string } }
      select: { id: true }
      take: number
    }): Promise<{ id: string }[]>
    deleteMany(args: { where: { id: { in: string[] }; nombre: string } }): Promise<{ count: number }>
  }
  portalVistaCorredor: {
    findMany(args: { where: { id: { in: string[] }; usadoEn: { lt: Date } }; select: { id: true } }): Promise<{ id: string }[]>
  }
  portalVinculo: {
    deleteMany(args: { where: { identidadId: string; origen: string; creadoEn: { lt: Date } } }): Promise<{ count: number }>
  }
}

/**
 * Crea la identidad de ESTA apertura y su único vínculo. Va dentro de la misma transacción que
 * gasta el enlace: si el vínculo falla, no queda una identidad suelta; y si el enlace ya estaba
 * gastado no se llega aquí. `vistaId` = id de la fila de `portal_vista_corredor` consumida.
 */
export async function crearIdentidadDeVista(
  tx: TxIdentidadVista,
  v: { vistaId: string; correduriaId: string; clienteId: string },
): Promise<string> {
  if (v.vistaId === IDENTIDAD_CORREDOR_ID) throw new Error('vista con el id de la identidad compartida')
  const { id } = await tx.portalIdentidad.create({ data: { id: v.vistaId, nombre: NOMBRE_IDENTIDAD_VISTA }, select: { id: true } })
  await tx.portalVinculo.create({
    data: { identidadId: id, correduriaId: v.correduriaId, clienteId: v.clienteId, nivel: 'gestionar', origen: ORIGEN_VINCULO_CORREDOR },
    select: { id: true },
  })
  return id
}

/** Momento antes del cual una sesión de vista ya no puede estar viva (la cookie dura `SESION_CORREDOR_SEGUNDOS`). */
export function corteCaducidadVista(ahora: Date): Date {
  return new Date(ahora.getTime() - SESION_CORREDOR_SEGUNDOS * 1000)
}

/**
 * Borra las identidades de vista cuya sesión ya caducó (en cascada se van su vínculo y lo que
 * hubiera colgado de ellas) y los vínculos residuales de la identidad compartida antigua.
 * Devuelve cuántas identidades borró. Quien la llama la trata como best-effort.
 */
export async function limpiarIdentidadesDeVistaCaducadas(db: DbLimpiezaVista, ahora: Date = new Date()): Promise<number> {
  const corte = corteCaducidadVista(ahora)
  const candidatas = await db.portalIdentidad.findMany({
    where: { nombre: NOMBRE_IDENTIDAD_VISTA, creadaEn: { lt: corte }, id: { not: IDENTIDAD_CORREDOR_ID } },
    select: { id: true },
    take: LIMPIEZA_POR_APERTURA,
  })
  let borradas = 0
  if (candidatas.length > 0) {
    // Solo las que son de verdad una vista ya caducada: su id es el de un enlace gastado antes del corte.
    const vistas = await db.portalVistaCorredor.findMany({
      where: { id: { in: candidatas.map((c) => c.id) }, usadoEn: { lt: corte } },
      select: { id: true },
    })
    const ids = vistas.map((v) => v.id).filter((id) => id !== IDENTIDAD_CORREDOR_ID)
    if (ids.length > 0) {
      borradas = (await db.portalIdentidad.deleteMany({ where: { id: { in: ids }, nombre: NOMBRE_IDENTIDAD_VISTA } })).count
    }
  }
  // La identidad compartida de antes (se conserva: apps/asegura la nombra): sus vínculos de
  // corredor ya caducados se sueltan. Ninguna sesión nueva cuelga ya de ella.
  await db.portalVinculo.deleteMany({
    where: { identidadId: IDENTIDAD_CORREDOR_ID, origen: ORIGEN_VINCULO_CORREDOR, creadoEn: { lt: corte } },
  })
  return borradas
}
