// IMPORTAR PATRIMONIO (P18, 26/10/2026) — adaptador con BD de `importacion-api.ts`.
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); el titular y el id de la URL NUNCA
// consultan por sí solos: se buscan DENTRO de lo autorizado y de las importaciones de ESTA identidad. Sin RLS, un `where`
// de menos devuelve el patrimonio de cualquiera.
// Hasta confirmar solo se escriben las tablas `portal_patrimonio_importacion(_fila)`; nada de lo que leen la rentabilidad, el
// calendario o los avisos se toca. Confirmar es UNA transacción: cierra la importación (condicionada a que siguiera abierta,
// así dos confirmaciones no duplican), vuelve a evaluar contra lo que haya en ese instante y crea solo las filas «nueva».
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  clavesDeInmuebleExistente,
  claveContrato,
  claveGasto,
  resumirEvaluacion,
  type Celda,
  type FilaEvaluada,
  type InmuebleRef,
  type TipoImportacion,
} from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { titularParaAlta } from './inmuebles-bd'
import type { ContextoImportacion, ImportacionLeida, MapeoGuardado, PuertosImportacion } from './importacion-api'

const ABIERTAS = ['propuesta', 'revisada']
const aFecha = (f: string): Date => new Date(`${f}T00:00:00.000Z`)
const iso = (d: Date): string => d.toISOString().slice(0, 10)

function mapeoDeJson(v: unknown): MapeoGuardado {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const cabeceras = Array.isArray(o.cabeceras) ? o.cabeceras.map((c) => String(c)) : []
  const columnas = (o.columnas && typeof o.columnas === 'object' ? o.columnas : {}) as Record<string, number | null>
  return { cabeceras, columnas, usoPorDefecto: typeof o.usoPorDefecto === 'string' ? o.usoPorDefecto : null }
}

function crudoDeJson(v: unknown): Celda[] | null {
  const o = (v && typeof v === 'object' ? v : null) as { crudo?: unknown } | null
  if (!o || !Array.isArray(o.crudo)) return null
  return o.crudo.map((c) => (typeof c === 'string' || typeof c === 'number' ? c : null))
}

/** Lo que ya hay del titular y las claves para no duplicarlo. Se usa dentro y fuera de la transacción. */
async function contextoDe(
  db: Prisma.TransactionClient | typeof prisma,
  titularId: string,
  tipo: TipoImportacion,
): Promise<ContextoImportacion> {
  const inmuebles = await db.portalPatrimonioInmueble.findMany({
    where: { titularId, archivadoEn: null },
    select: { id: true, alias: true, referenciaCatastral: true, direccionNormalizada: true },
  })
  const refs: InmuebleRef[] = inmuebles.map((i) => ({
    id: i.id,
    alias: i.alias,
    referenciaCatastral: i.referenciaCatastral === null ? null : i.referenciaCatastral.trim(),
    direccionNormalizada: i.direccionNormalizada,
  }))
  const existentes = new Set<string>()
  if (tipo === 'inmueble') {
    for (const i of refs) for (const c of clavesDeInmuebleExistente({ referenciaCatastral: i.referenciaCatastral, direccionNormalizada: i.direccionNormalizada, alias: i.alias })) existentes.add(c)
  } else if (tipo === 'contrato') {
    const cs = await db.portalPatrimonioContrato.findMany({ where: { titularId, archivadoEn: null }, select: { inmuebleId: true, inicio: true } })
    for (const c of cs) existentes.add(claveContrato(c.inmuebleId, iso(c.inicio)))
  } else {
    const gs = await db.portalPatrimonioGasto.findMany({
      where: { titularId, estado: { not: 'descartado' }, totalCent: { not: null } },
      select: { inmuebleId: true, fecha: true, totalCent: true, concepto: true },
    })
    for (const g of gs) existentes.add(claveGasto({ inmuebleId: g.inmuebleId, fecha: iso(g.fecha), totalCent: Number(g.totalCent), concepto: g.concepto }))
  }
  return { inmuebles: refs, existentes }
}

export function puertosImportacion(identidadId: string): PuertosImportacion {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (`accesosPatrimonio` ya lo exige también).
  const accesos = async () => {
    if (cache) return cache
    const sesion = await getIdentidad()
    return (cache = !sesion || sesion.id !== identidadId ? new Map() : await accesosPatrimonio(identidadId))
  }

  /** El titular (id de `portal_patrimonio_titular`) de una ficha AUTORIZADA, o `null` si no hay/está archivado. */
  async function titularDe(clienteId: string, crear: boolean): Promise<string | null> {
    const acc = await accesos()
    if (!acc.has(clienteId)) return null
    if (!crear) {
      const t = await prisma.portalPatrimonioTitular.findUnique({ where: { clienteId }, select: { id: true, archivadoEn: true } })
      return t && t.archivadoEn === null ? t.id : null
    }
    const t = await titularParaAlta(identidadId, clienteId)
    return t && t.archivadoEn === null ? t.id : null
  }

  return {
    accesos,

    async creadasHoy() {
      const acc = await accesos()
      if (acc.size === 0) return 0
      return prisma.portalPatrimonioImportacion.count({ where: { identidadId, creadoEn: { gte: new Date(Date.now() - 24 * 3600_000) } } })
    },

    async crear({ clienteId, tipo, hash, nombre, mapeo, filas }) {
      const titularId = await titularDe(clienteId, true)
      if (!titularId) return { ok: false }
      const abierta = () =>
        prisma.portalPatrimonioImportacion.findFirst({
          where: { titularId, ficheroHash: hash, estado: { in: ABIERTAS } },
          select: { id: true, identidadId: true },
        })
      const previa = await abierta()
      // El mismo fichero ya está abierto: se devuelve ESA (idempotente). Si es de otra identidad, no se confirma que exista.
      if (previa) return previa.identidadId === identidadId ? { ok: true, id: previa.id, nueva: false } : { ok: false }
      try {
        const id = await prisma.$transaction(async (tx) => {
          const imp = await tx.portalPatrimonioImportacion.create({
            data: {
              identidadId,
              titularId,
              tipo,
              ficheroHash: hash,
              ficheroNombre: nombre,
              filasTotal: filas.length,
              mapeo: mapeo as unknown as Prisma.InputJsonValue,
              creadoPorIdentidadId: identidadId,
            },
            select: { id: true },
          })
          await tx.portalPatrimonioImportacionFila.createMany({
            data: filas.map((f) => ({
              importacionId: imp.id,
              n: f.n,
              entidad: tipo,
              datos: { crudo: f.crudo } as unknown as Prisma.InputJsonValue,
              problema: f.problema,
              creadoPorIdentidadId: identidadId,
            })),
          })
          return imp.id
        })
        return { ok: true, id, nueva: true }
      } catch (e) {
        // Carrera con otra subida del mismo fichero: gana el índice único.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          const p2 = await abierta()
          return p2 && p2.identidadId === identidadId ? { ok: true, id: p2.id, nueva: false } : { ok: false }
        }
        throw e
      }
    },

    async leer(id): Promise<ImportacionLeida | null> {
      const acc = await accesos()
      if (acc.size === 0) return null
      const imp = await prisma.portalPatrimonioImportacion.findFirst({
        where: { id, identidadId, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
        include: { titular: { select: { clienteId: true } }, filas: { orderBy: { n: 'asc' } } },
      })
      if (!imp || imp.tipo === null || !['propuesta', 'revisada', 'confirmada', 'descartada'].includes(imp.estado)) return null
      return {
        id: imp.id,
        clienteId: imp.titular.clienteId,
        estado: imp.estado as ImportacionLeida['estado'],
        tipo: imp.tipo as TipoImportacion,
        nombre: imp.ficheroNombre,
        mapeo: mapeoDeJson(imp.mapeo),
        filas: imp.filas.map((f) => ({ n: f.n, crudo: crudoDeJson(f.datos), problema: f.problema, creadoId: f.creadoId })),
        resultado: imp.resultado && typeof imp.resultado === 'object' ? (imp.resultado as Record<string, unknown>) : null,
        confirmadaEn: imp.confirmadaEn ? imp.confirmadaEn.toISOString() : null,
      }
    },

    async contexto(clienteId, tipo) {
      const titularId = await titularDe(clienteId, false)
      if (!titularId) return { inmuebles: [], existentes: new Set() }
      return contextoDe(prisma, titularId, tipo)
    },

    async guardarMapeo(id, { tipo, mapeo, filas }) {
      const acc = await accesos()
      if (acc.size === 0) return false
      return prisma.$transaction(async (tx) => {
        const cerrada = await tx.portalPatrimonioImportacion.updateMany({
          where: { id, identidadId, estado: { in: ABIERTAS }, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
          data: { tipo, estado: 'revisada', mapeo: mapeo as unknown as Prisma.InputJsonValue },
        })
        if (cerrada.count === 0) return false
        await tx.portalPatrimonioImportacionFila.updateMany({ where: { importacionId: id }, data: { entidad: tipo } })
        const actuales = await tx.portalPatrimonioImportacionFila.findMany({ where: { importacionId: id }, select: { n: true, problema: true } })
        const antes = new Map(actuales.map((f) => [f.n, f.problema]))
        for (const f of filas) {
          if ((antes.get(f.n) ?? null) !== f.problema) {
            await tx.portalPatrimonioImportacionFila.updateMany({ where: { importacionId: id, n: f.n }, data: { problema: f.problema } })
          }
        }
        return true
      })
    },

    async confirmar(id, evaluar) {
      const acc = await accesos()
      if (acc.size === 0) return { ok: false, motivo: 'cerrada' }
      return prisma.$transaction(
        async (tx) => {
          const imp = await tx.portalPatrimonioImportacion.findFirst({
            where: { id, identidadId, estado: { in: ABIERTAS }, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
            select: { titularId: true, tipo: true },
          })
          if (!imp || imp.tipo === null) return { ok: false as const, motivo: 'cerrada' as const }
          const tipo = imp.tipo as TipoImportacion
          // 1) Cierre condicionado: si otra petición se adelantó, count 0 y aquí no se crea NADA.
          const cierre = await tx.portalPatrimonioImportacion.updateMany({
            where: { id, estado: { in: ABIERTAS } },
            data: { estado: 'confirmada', confirmadaEn: new Date() },
          })
          if (cierre.count === 0) return { ok: false as const, motivo: 'cerrada' as const }

          // 2) Evaluar contra lo que hay AHORA y crear solo las «nueva».
          const ctx = await contextoDe(tx, imp.titularId, tipo)
          const evaluadas = evaluar(ctx)
          const creadas = new Map<number, string>()
          for (const f of evaluadas) {
            if (f.estado !== 'nueva') continue
            creadas.set(f.n, await crearFila(tx, imp.titularId, identidadId, f))
          }

          // 3) Sello: qué fila creó qué, por qué se apartó el resto, y el recuento (auditoría).
          for (const [n, creadoId] of creadas) {
            await tx.portalPatrimonioImportacionFila.updateMany({ where: { importacionId: id, n }, data: { creadoId } })
          }
          for (const estado of ['ya_existe', 'repetida'] as const) {
            const filas = evaluadas.filter((f) => f.estado === estado)
            if (filas.length === 0) continue
            await tx.portalPatrimonioImportacionFila.updateMany({
              where: { importacionId: id, n: { in: filas.map((f) => f.n) } },
              data: { problema: estado === 'ya_existe' ? 'Ya existía: no se ha creado.' : 'Repetida en el fichero: no se ha creado.' },
            })
          }
          const resultado = { creadas: creadas.size, ...resumirEvaluacion(evaluadas) }
          await tx.portalPatrimonioImportacion.updateMany({ where: { id }, data: { resultado: resultado as unknown as Prisma.InputJsonValue } })
          return { ok: true as const, evaluadas, creadas: creadas.size }
        },
        { timeout: 60_000, maxWait: 10_000 },
      )
    },

    async descartar(id) {
      const acc = await accesos()
      if (acc.size === 0) return false
      const r = await prisma.portalPatrimonioImportacion.updateMany({
        where: { id, identidadId, estado: { in: ABIERTAS }, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
        data: { estado: 'descartada' },
      })
      return r.count > 0
    },
  }
}

/** Crea UNA fila «nueva» como lo haría la pantalla normal (mismas columnas, `creado_por` = esta identidad). Devuelve el id. */
async function crearFila(tx: Prisma.TransactionClient, titularId: string, identidadId: string, f: FilaEvaluada): Promise<string> {
  const d = f.datos
  if (f.entidad === 'inmueble') {
    const i = await tx.portalPatrimonioInmueble.create({
      data: {
        titularId,
        alias: d.alias as string,
        uso: d.uso as string,
        referenciaCatastral: d.referenciaCatastral as string | null,
        cp: d.cp as string | null,
        // La calle NO se ha comprobado con el callejero: `via` nulo = «calle por validar»; el texto va entero en la normalizada.
        via: null,
        numero: null,
        resto: null,
        direccionNormalizada: d.direccionNormalizada as string | null,
        enComunidad: d.enComunidad as boolean | null,
        creadoPorIdentidadId: identidadId,
      },
      select: { id: true },
    })
    return i.id
  }
  if (f.entidad === 'contrato') {
    const c = await tx.portalPatrimonioContrato.create({
      data: {
        titularId,
        inmuebleId: f.inmuebleId!,
        inicio: aFecha(d.inicio as string),
        fin: d.fin === null ? null : aFecha(d.fin as string),
        rentaMensualCent: BigInt(d.rentaCent as number),
        clausula: d.clausula as string,
        indice: d.indice as string | null,
        fianzaCent: d.fianzaCent === null ? null : BigInt(d.fianzaCent as number),
        creadoPorIdentidadId: identidadId,
      },
      select: { id: true },
    })
    return c.id
  }
  // Gasto: la clave `imp:` + hash de la clave natural lo hace idempotente también en BD (índice único titular+clave).
  const g = await tx.portalPatrimonioGasto.create({
    data: {
      titularId,
      inmuebleId: f.inmuebleId,
      fecha: aFecha(d.fecha as string),
      categoria: d.categoria as string | null,
      concepto: d.concepto as string | null,
      baseCent: d.baseCent === null ? null : BigInt(d.baseCent as number),
      totalCent: BigInt(d.totalCent as number),
      estado: 'confirmado',
      origen: 'manual',
      clave: `imp:${createHash('sha256').update(f.claves[0]).digest('hex').slice(0, 32)}`,
      confirmadoEn: new Date(),
      confirmadoPorIdentidadId: identidadId,
      creadoPorIdentidadId: identidadId,
    },
    select: { id: true },
  })
  return g.id
}
