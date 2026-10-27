// VOLCADO INICIAL (27/10/2026) — adaptador con BD de `volcado-api.ts`.
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); el titular y el id de la URL NUNCA
// consultan por sí solos: se buscan DENTRO de lo autorizado y de los volcados de ESTA identidad (`identidadId` en el where).
// Sin RLS, un `where` de menos devuelve el patrimonio de cualquiera.
// Hasta confirmar solo se escriben las tablas de importación (`volcado: true`); nada de lo que leen la rentabilidad, el
// calendario o los avisos se toca. Confirmar es UNA transacción (`volcado-tx.ts`): cierre condicionado a que siguiera abierto
// (dos confirmaciones no duplican) → evaluar contra lo que hay en ese instante → crear con el titular DEL VOLCADO.
import { Prisma } from '@prisma/client'
import {
  claveContrato,
  clavePlantilla,
  claveUnidad,
  clavesDeInmuebleExistente,
  type ContextoVolcado,
  type PropuestaVolcado,
} from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { inicioMesMadrid } from './dia-madrid'
import { proponerDesdeDocumento, proponerDesdeHoja } from './extraer-volcado'
import { titularParaAlta } from './inmuebles-bd'
import { altaInquilinoPorPuente } from './inquilinos-puente'
import { valorClienteDeIdentidad } from './valor-cliente-bd'
import type { PuertosVolcado, VolcadoLeido } from './volcado-api'
import { escribirVolcadoTx, reservarVolcadoTx, type TxVolcado } from './volcado-tx'

const ABIERTAS = ['propuesta', 'revisada']
const iso = (d: Date): string => d.toISOString().slice(0, 10)
const ENTIDAD = { inmuebles: 'inmueble', contratos: 'contrato', gastos: 'plantilla_gasto' } as const

/** Lo que ya hay del titular, con el id de cada clave. Se usa dentro y fuera de la transacción. */
async function contextoDe(db: Prisma.TransactionClient | typeof prisma, titularId: string): Promise<ContextoVolcado> {
  const inmuebles = await db.portalPatrimonioInmueble.findMany({
    where: { titularId, archivadoEn: null },
    select: { id: true, alias: true, uso: true, referenciaCatastral: true, direccionNormalizada: true, inmueblePadreId: true },
  })
  const existentes = new Map<string, string>()
  for (const i of inmuebles) {
    // Una unidad hereda la dirección del edificio: solo la identifica su nombre DENTRO del edificio.
    if (i.inmueblePadreId !== null) { existentes.set(claveUnidad(i.inmueblePadreId, i.alias), i.id); continue }
    for (const c of clavesDeInmuebleExistente({ referenciaCatastral: i.referenciaCatastral?.trim() ?? null, direccionNormalizada: i.direccionNormalizada, alias: i.alias })) {
      if (!existentes.has(c)) existentes.set(c, i.id)
    }
  }
  const contratos = await db.portalPatrimonioContrato.findMany({ where: { titularId, archivadoEn: null }, select: { id: true, inmuebleId: true, inicio: true } })
  for (const c of contratos) existentes.set(claveContrato(c.inmuebleId, iso(c.inicio)), c.id)
  const plantillas = await db.portalPatrimonioPlantillaGasto.findMany({ where: { titularId, activo: true }, select: { id: true, inmuebleId: true, concepto: true, periodicidad: true } })
  for (const p of plantillas) existentes.set(clavePlantilla({ inmuebleId: p.inmuebleId, concepto: p.concepto, periodicidad: p.periodicidad }), p.id)
  return { inmuebles: inmuebles.map((i) => ({ id: i.id, alias: i.alias, uso: i.uso, inmueblePadreId: i.inmueblePadreId })), existentes }
}

function propuestaDeFilas(filas: { entidad: string; datos: unknown }[]): PropuestaVolcado {
  const p: PropuestaVolcado = { inmuebles: [], contratos: [], gastos: [] }
  for (const f of filas) {
    if (!f.datos || typeof f.datos !== 'object') continue
    if (f.entidad === 'inmueble') p.inmuebles.push(f.datos as PropuestaVolcado['inmuebles'][number])
    else if (f.entidad === 'contrato') p.contratos.push(f.datos as PropuestaVolcado['contratos'][number])
    else if (f.entidad === 'plantilla_gasto') p.gastos.push(f.datos as PropuestaVolcado['gastos'][number])
  }
  return p
}

export function puertosVolcado(identidadId: string, ahora: () => Date = () => new Date()): PuertosVolcado {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (`accesosPatrimonio` ya lo exige también).
  const accesos = async () => {
    if (cache) return cache
    const sesion = await getIdentidad()
    return (cache = !sesion || sesion.id !== identidadId ? new Map() : await accesosPatrimonio(identidadId))
  }
  const clientes = async () => [...(await accesos()).keys()]

  /** El titular (id de `portal_patrimonio_titular`) de una ficha AUTORIZADA, o `null`. */
  async function titularDe(clienteId: string, crear: boolean): Promise<string | null> {
    if (!(await accesos()).has(clienteId)) return null
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
      if ((await accesos()).size === 0) return 0
      return prisma.portalPatrimonioImportacion.count({ where: { identidadId, creadoEn: { gte: new Date(ahora().getTime() - 24 * 3600_000) } } })
    },

    async abierto(clienteId, hash) {
      const titularId = await titularDe(clienteId, false)
      if (!titularId) return null
      return prisma.portalPatrimonioImportacion.findFirst({
        where: { identidadId, titularId, volcado: true, ficheroHash: hash, estado: { in: ABIERTAS } },
        select: { id: true },
      })
    },

    valorCliente: (clienteId) => valorClienteDeIdentidad(identidadId, clienteId),

    async reservar({ clienteId, hash, nombre, cupoMes }) {
      const titularId = await titularDe(clienteId, true)
      if (!titularId) return { ok: false, motivo: 'no_encontrado' }
      try {
        return await prisma.$transaction((tx) =>
          reservarVolcadoTx(tx as unknown as TxVolcado, { identidadId, titularId, hash, nombre, cupoMes, desdeMes: inicioMesMadrid(ahora()) }),
        )
      } catch (e) {
        // El mismo fichero ya tiene una importación abierta (índice único titular + hash): no se lee otra vez.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, motivo: 'abierto' }
        throw e
      }
    },

    leer: (f) => (f.tipo === 'hoja' ? proponerDesdeHoja(f.hoja) : proponerDesdeDocumento(f.contenido, f.mime)),

    async guardarPropuesta(id, propuesta, motivos) {
      const acc = await clientes()
      if (acc.length === 0) return false
      return prisma.$transaction(async (tx) => {
        const v = await tx.portalPatrimonioImportacion.updateMany({
          where: { id, identidadId, volcado: true, estado: { in: ABIERTAS }, titular: { clienteId: { in: acc }, archivadoEn: null } },
          data: { mapeo: { volcado: { motivos } } as unknown as Prisma.InputJsonValue },
        })
        if (v.count === 0) return false
        let n = 0
        const filas: Prisma.PortalPatrimonioImportacionFilaCreateManyInput[] = []
        for (const k of ['inmuebles', 'contratos', 'gastos'] as const) {
          for (const d of propuesta[k]) filas.push({ importacionId: id, n: ++n, entidad: ENTIDAD[k], datos: d as unknown as Prisma.InputJsonValue, creadoPorIdentidadId: identidadId })
        }
        await tx.portalPatrimonioImportacionFila.createMany({ data: filas })
        return true
      })
    },

    async ver(id): Promise<VolcadoLeido | null> {
      const acc = await clientes()
      if (acc.length === 0) return null
      const v = await prisma.portalPatrimonioImportacion.findFirst({
        where: { id, identidadId, volcado: true, titular: { clienteId: { in: acc }, archivadoEn: null } },
        include: { titular: { select: { clienteId: true } }, filas: { orderBy: { n: 'asc' }, select: { entidad: true, datos: true } } },
      })
      if (!v || !['propuesta', 'revisada', 'confirmada', 'descartada'].includes(v.estado)) return null
      const m = (v.mapeo && typeof v.mapeo === 'object' ? (v.mapeo as Record<string, unknown>).volcado : null) as { motivos?: unknown } | null
      return {
        id: v.id,
        clienteId: v.titular.clienteId,
        estado: v.estado as VolcadoLeido['estado'],
        nombre: v.ficheroNombre,
        propuesta: propuestaDeFilas(v.filas),
        motivos: Array.isArray(m?.motivos) ? m!.motivos.filter((x): x is string => typeof x === 'string') : [],
        resultado: v.resultado && typeof v.resultado === 'object' ? (v.resultado as Record<string, unknown>) : null,
      }
    },

    async contexto(clienteId) {
      const titularId = await titularDe(clienteId, false)
      if (!titularId) return { inmuebles: [], existentes: new Map() }
      return contextoDe(prisma, titularId)
    },

    async confirmar(id, propuesta, evaluar) {
      const acc = await clientes()
      if (acc.length === 0) return { ok: false, motivo: 'cerrado' }
      return prisma.$transaction(
        async (tx) => {
          const v = await tx.portalPatrimonioImportacion.findFirst({
            where: { id, identidadId, volcado: true, estado: { in: ABIERTAS }, titular: { clienteId: { in: acc }, archivadoEn: null } },
            select: { titularId: true },
          })
          if (!v) return { ok: false as const, motivo: 'cerrado' as const }
          // 1) Cierre condicionado: si otra petición se adelantó, count 0 y aquí no se crea NADA.
          const cierre = await tx.portalPatrimonioImportacion.updateMany({
            where: { id, identidadId, volcado: true, estado: { in: ABIERTAS } },
            data: { estado: 'confirmada', confirmadaEn: new Date() },
          })
          if (cierre.count === 0) return { ok: false as const, motivo: 'cerrado' as const }
          // 2) Evaluar contra lo que hay AHORA y crear solo las «nueva», con el titular del VOLCADO.
          const evaluacion = evaluar(await contextoDe(tx, v.titularId))
          const r = await escribirVolcadoTx(tx as unknown as TxVolcado, { titularId: v.titularId, identidadId, propuesta, evaluacion })
          // 3) Auditoría sin datos personales: solo recuentos.
          await tx.portalPatrimonioImportacion.updateMany({
            where: { id, identidadId },
            data: { resultado: { creados: r.creados, ...evaluacion.resumen } as unknown as Prisma.InputJsonValue },
          })
          return { ok: true as const, evaluacion, ...r }
        },
        { timeout: 60_000, maxWait: 10_000 },
      )
    },

    async descartar(id) {
      const acc = await clientes()
      if (acc.length === 0) return false
      const r = await prisma.portalPatrimonioImportacion.updateMany({
        where: { id, identidadId, volcado: true, estado: { in: ABIERTAS }, titular: { clienteId: { in: acc }, archivadoEn: null } },
        data: { estado: 'descartada' },
      })
      return r.count > 0
    },

    async altaInquilino(contratoId, q) {
      // Solo nombre y tipo: el puente (apps/asegura) vuelve a comprobar el nivel Total sobre el titular DEL CONTRATO.
      const r = await altaInquilinoPorPuente(identidadId, contratoId, { tipo: q.tipo, nombre: q.nombre, papel: 'titular', nif: null, email: null, telefono: null })
      if (r.estado === 'ok') return 'ok'
      if (r.estado === 'sin_puente' || r.estado === 'sin_clave') return r.estado
      return 'error'
    },
  }
}

/** Lecturas con IA de volcados del titular en el mes (para el cupo de las FACTURAS, dentro de SU transacción y bloqueo). */
export { contarVolcadosMesTx } from './volcado-tx'
