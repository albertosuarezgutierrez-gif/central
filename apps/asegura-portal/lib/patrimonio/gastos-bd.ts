// PATRIMONIO (22/10/2026, paso 6) — adaptador con BD de gastos fijos, comunidad y derramas.
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`). El titular, el inmueble y la
// comunidad del cuerpo NUNCA consultan por sí solos: se buscan DENTRO del titular ya autorizado (`titular.clienteId`
// viene de `accesos()`), y la BD lo repite con FK compuestas (inmueble/comunidad del MISMO titular). `titular_id` se
// resuelve aquí, en servidor, desde la ficha: nunca llega del cliente.
import { Prisma } from '@prisma/client'
import { puede } from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { leerPropuestaGuardada } from './factura-propuesta'
import type { AccesosMapa, FacturaPendiente, GastoFila, PuertosGastos, TitularGastos } from './gastos-api'

/** Tope de filas que se traen por titular; la pantalla las pliega de 50 en 50. */
const MAX_PENDIENTES = 150
/** Gastos recientes por titular (propuestos + confirmados). */
const MAX_GASTOS = 200

const dia = (d: Date) => d.toISOString().slice(0, 10)
const aFecha = (s: string) => new Date(`${s}T00:00:00.000Z`)
const nombreDe = (f: { nombre: string; apellidos: string | null }) => `${f.nombre} ${f.apellidos ?? ''}`.trim()
const num = (v: bigint | number | null) => (v === null ? null : Number(v))

/** El titular (fila `portal_patrimonio_titular`) de una ficha YA autorizada; nace la primera vez que se da de alta algo. */
export async function titularDe(clienteId: string, identidadId: string): Promise<{ id: string } | null> {
  const ficha = await prisma.cliente.findFirst({
    where: { id: clienteId, mergedIntoClienteId: null, activo: true },
    select: { id: true, correduriaId: true, tipoPersona: true },
  })
  if (!ficha) return null
  const t =
    (await prisma.portalPatrimonioTitular.findUnique({ where: { clienteId }, select: { id: true, archivadoEn: true } })) ??
    (await prisma.portalPatrimonioTitular.create({
      data: { clienteId, correduriaId: ficha.correduriaId, tipo: ficha.tipoPersona === 'juridica' ? 'sociedad' : 'persona', creadoPorIdentidadId: identidadId },
      select: { id: true, archivadoEn: true },
    }))
  return t.archivadoEn === null ? { id: t.id } : null
}

async function listarGastos(identidadId: string, ids: readonly string[], accesos: AccesosMapa): Promise<TitularGastos[]> {
  // Defensa en profundidad: la sesión tiene que ser la de `identidadId` (`accesosPatrimonio` ya lo exige).
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return []
  const [fichas, titulares, vinculos] = await Promise.all([
    prisma.cliente.findMany({ where: { id: { in: [...ids] } }, select: { id: true, nombre: true, apellidos: true } }),
    prisma.portalPatrimonioTitular.findMany({
      where: { clienteId: { in: [...ids] }, archivadoEn: null },
      select: {
        id: true,
        clienteId: true,
        inmuebles: { where: { archivadoEn: null }, orderBy: { alias: 'asc' }, select: { id: true, alias: true } },
        plantillas: { orderBy: [{ activo: 'desc' }, { concepto: 'asc' }] },
        comunidades: {
          where: { archivadoEn: null },
          orderBy: { nombre: 'asc' },
          include: {
            inmuebles: { where: { archivadoEn: null }, select: { inmuebleId: true, coeficiente: true } },
            derramas: { where: { archivadoEn: null }, orderBy: { primera: 'desc' } },
          },
        },
      },
    }),
    // Cuáles de esas fichas son las TUYAS (vínculo de esta identidad): el resto las ves por Dueño o por autorización.
    prisma.portalVinculo.findMany({ where: { identidadId, origen: { not: 'corredor' } }, select: { clienteId: true } }),
  ])
  // Facturas por revisar: SOLO de los titulares (ya dentro de `accesos`) donde esta identidad tiene nivel de gestión.
  const gestionables = titulares.filter((t) => puede(accesos.get(t.clienteId), 'gestionar_gastos_documentos'))
  const pendientesPorTitular = new Map<string, FacturaPendiente[]>()
  await Promise.all(
    gestionables.map(async (t) => {
      const filas = await prisma.portalPatrimonioGasto.findMany({
        where: { titularId: t.id, origen: 'factura', estado: 'propuesto' },
        orderBy: { creadoEn: 'desc' },
        take: MAX_PENDIENTES,
        select: { id: true, inmuebleId: true, propuesta: true, creadoEn: true },
      })
      const vivos = new Set(t.inmuebles.map((i) => i.id))
      pendientesPorTitular.set(
        t.clienteId,
        filas.map((g) => ({ id: g.id, inmuebleId: g.inmuebleId && vivos.has(g.inmuebleId) ? g.inmuebleId : null, ...leerPropuestaGuardada(g.propuesta), subidaEn: g.creadoEn.toISOString() })),
      )
    }),
  )
  // Gastos recientes (propuestos por el cron/derrama y confirmados) de CADA titular ya autorizado. Las facturas
  // propuestas se excluyen: salen en «por revisar».
  const gastosPorTitular = new Map<string, GastoFila[]>()
  await Promise.all(
    titulares.map(async (t) => {
      const filas = await prisma.portalPatrimonioGasto.findMany({
        where: { titularId: t.id, estado: { in: ['propuesto', 'confirmado'] }, NOT: { origen: 'factura', estado: 'propuesto' } },
        orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
        take: MAX_GASTOS,
        select: { id: true, inmuebleId: true, fecha: true, concepto: true, categoria: true, totalCent: true, estado: true, origen: true },
      })
      gastosPorTitular.set(
        t.clienteId,
        filas.map((g): GastoFila => ({
          id: g.id, inmuebleId: g.inmuebleId, fecha: dia(g.fecha), concepto: g.concepto, categoria: g.categoria,
          totalCent: num(g.totalCent), estado: g.estado === 'confirmado' ? 'confirmado' : 'propuesto', origen: g.origen,
        })),
      )
    }),
  )
  const propias = new Set(vinculos.map((v) => v.clienteId))
  const porCliente = new Map(titulares.map((t) => [t.clienteId, t]))
  return fichas
    .map((f): TitularGastos => {
      const nivel = accesos.get(f.id)!
      const t = porCliente.get(f.id)
      const alias = new Map((t?.inmuebles ?? []).map((i) => [i.id, i.alias]))
      return {
        clienteId: f.id,
        nombre: nombreDe(f),
        nivel,
        propio: propias.has(f.id),
        puedeGestionar: puede(nivel, 'gestionar_gastos_documentos'),
        puedeEstructura: puede(nivel, 'alta_baja'),
        facturasPendientes: pendientesPorTitular.get(f.id) ?? [],
        gastos: gastosPorTitular.get(f.id) ?? [],
        inmuebles: (t?.inmuebles ?? []).map((i) => ({ id: i.id, alias: i.alias })),
        plantillas: (t?.plantillas ?? []).map((p) => ({
          id: p.id,
          inmuebleId: p.inmuebleId,
          inmuebleAlias: p.inmuebleId ? (alias.get(p.inmuebleId) ?? null) : null,
          concepto: p.concepto,
          categoria: p.categoria,
          periodicidad: p.periodicidad,
          diaMes: p.diaMes,
          inicio: dia(p.inicio),
          fin: p.fin ? dia(p.fin) : null,
          importeCent: num(p.importeCent),
          proveedor: p.proveedor,
          activo: p.activo,
        })),
        comunidades: (t?.comunidades ?? []).map((c) => ({
          id: c.id,
          nombre: c.nombre,
          administradorNombre: c.administradorNombre,
          inmuebles: c.inmuebles.map((x) => ({
            inmuebleId: x.inmuebleId,
            alias: alias.get(x.inmuebleId) ?? '—',
            coeficiente: x.coeficiente === null ? null : Number(x.coeficiente),
          })),
        })),
        derramas: (t?.comunidades ?? []).flatMap((c) =>
          c.derramas.map((d) => ({
            id: d.id,
            comunidadId: c.id,
            comunidadNombre: c.nombre,
            inmuebleId: d.inmuebleId,
            inmuebleAlias: alias.get(d.inmuebleId) ?? '—',
            concepto: d.concepto,
            totalCent: Number(d.totalCent),
            cuotas: d.cuotas,
            primera: dia(d.primera),
          })),
        ),
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

const codigoPrisma = (e: unknown) => (e instanceof Prisma.PrismaClientKnownRequestError ? e.code : null)

export function puertosGastos(identidadId: string): PuertosGastos {
  let cache: AccesosMapa | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  return {
    accesos,
    listar: (ids, acc) => listarGastos(identidadId, ids, acc),

    async crearPlantilla({ clienteId, datos }) {
      const t = await titularDe(clienteId, identidadId)
      if (!t) return { ok: false, motivo: 'no_encontrado' }
      // El inmueble se busca DENTRO de este titular; si hay comunidad, el inmueble tiene que estar enlazado a ella.
      if (datos.inmuebleId) {
        const i = await prisma.portalPatrimonioInmueble.findFirst({ where: { id: datos.inmuebleId, titularId: t.id, archivadoEn: null }, select: { id: true } })
        if (!i) return { ok: false, motivo: 'no_encontrado' }
      }
      if (datos.comunidadId && datos.inmuebleId) {
        const e = await prisma.portalPatrimonioInmuebleComunidad.findFirst({
          where: { titularId: t.id, inmuebleId: datos.inmuebleId, comunidadId: datos.comunidadId, archivadoEn: null },
          select: { id: true },
        })
        if (!e) return { ok: false, motivo: 'no_encontrado' }
      }
      try {
        const p = await prisma.portalPatrimonioPlantillaGasto.create({
          data: {
            titularId: t.id,
            inmuebleId: datos.inmuebleId,
            comunidadId: datos.comunidadId,
            concepto: datos.concepto,
            categoria: datos.categoria,
            periodicidad: datos.periodicidad,
            diaMes: datos.diaMes,
            inicio: aFecha(datos.inicio),
            fin: datos.fin ? aFecha(datos.fin) : null,
            importeCent: datos.importeCent === null ? null : BigInt(datos.importeCent),
            proveedor: datos.proveedor,
            activo: true,
            creadoPorIdentidadId: identidadId,
          },
          select: { id: true },
        })
        return { ok: true, id: p.id }
      } catch (e) {
        // P2003 = FK compuesta (inmueble/comunidad de otro titular o sin enlace): para quien pregunta, «no existe».
        if (codigoPrisma(e) === 'P2003') return { ok: false, motivo: 'no_encontrado' }
        throw e
      }
    },

    async crearComunidad({ clienteId, datos }) {
      const t = await titularDe(clienteId, identidadId)
      if (!t) return { ok: false, motivo: 'no_encontrado' }
      // Todos los inmuebles pedidos tienen que ser de ESTE titular; si falta uno, 404 y no se crea nada.
      if (datos.inmuebles.length > 0) {
        const propios = await prisma.portalPatrimonioInmueble.findMany({
          where: { titularId: t.id, archivadoEn: null, id: { in: datos.inmuebles.map((i) => i.inmuebleId) } },
          select: { id: true },
        })
        if (propios.length !== datos.inmuebles.length) return { ok: false, motivo: 'no_encontrado' }
      }
      try {
        const id = await prisma.$transaction(async (tx) => {
          const c = await tx.portalPatrimonioComunidad.create({
            data: {
              titularId: t.id,
              nombre: datos.nombre,
              nifComunidad: datos.nifComunidad,
              administradorNombre: datos.administradorNombre,
              administradorEmail: datos.administradorEmail,
              creadoPorIdentidadId: identidadId,
            },
            select: { id: true },
          })
          for (const i of datos.inmuebles) {
            await tx.portalPatrimonioInmuebleComunidad.create({
              data: { titularId: t.id, inmuebleId: i.inmuebleId, comunidadId: c.id, coeficiente: i.coeficiente, creadoPorIdentidadId: identidadId },
            })
          }
          return c.id
        })
        return { ok: true, id }
      } catch (e) {
        const c = codigoPrisma(e)
        if (c === 'P2003') return { ok: false, motivo: 'no_encontrado' }
        if (c === 'P2002') return { ok: false, motivo: 'duplicado' }
        throw e
      }
    },

    async crearDerrama({ clienteId, datos }) {
      const t = await titularDe(clienteId, identidadId)
      if (!t) return { ok: false, motivo: 'no_encontrado' }
      // La comunidad es de UN titular: se busca dentro de este, y el inmueble tiene que estar enlazado a ella.
      const enlace = await prisma.portalPatrimonioInmuebleComunidad.findFirst({
        where: { titularId: t.id, comunidadId: datos.comunidadId, inmuebleId: datos.inmuebleId, archivadoEn: null, comunidad: { archivadoEn: null } },
        select: { id: true },
      })
      if (!enlace) return { ok: false, motivo: 'no_encontrado' }
      try {
        const d = await prisma.portalPatrimonioDerrama.create({
          data: {
            comunidadId: datos.comunidadId,
            inmuebleId: datos.inmuebleId,
            concepto: datos.concepto,
            totalCent: BigInt(datos.totalCent),
            cuotas: datos.cuotas,
            primera: aFecha(datos.primera),
            creadoPorIdentidadId: identidadId,
          },
          select: { id: true },
        })
        return { ok: true, id: d.id }
      } catch (e) {
        if (codigoPrisma(e) === 'P2003') return { ok: false, motivo: 'no_encontrado' }
        throw e
      }
    },
  }
}

/** Para la página de gastos. Vacío = esta identidad no tiene patrimonio. */
export async function gastosDeIdentidad(identidadId: string): Promise<TitularGastos[]> {
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return []
  return listarGastos(identidadId, [...accesos.keys()], accesos)
}

/**
 * Los gastos de UN titular para la ficha de su inmueble. 🚨 Sale de `gastosDeIdentidad` (accesos de la sesión): un
 * `clienteId` que no está entre los autorizados da `null`. El filtro por inmueble lo hace `gruposDeInmueble` (puro).
 */
export async function gastosDeTitular(identidadId: string, clienteId: string): Promise<TitularGastos | null> {
  const accesos = await accesosPatrimonio(identidadId)
  // El `clienteId` solo se lee si está DENTRO de los accesos de la sesión (404 para el resto), y se lee SOLO ese titular
  // (27/10/2026): antes se cargaban los gastos de todos los titulares para quedarse con uno.
  if (!accesos.has(clienteId)) return null
  const [t] = await listarGastos(identidadId, [clienteId], accesos)
  return t ?? null
}

/**
 * Tarjeta «Mi patrimonio» de Inicio. `undefined` = sin patrimonio a la vista (no se pinta nada); `null` = no se pudo
 * leer el acceso; objeto con `inmuebles`/`pendientes` `null` = esa cifra no se pudo leer (no es 0). Los «por confirmar»
 * (facturas por revisar + gastos propuestos: lo mismo que enseña la lista) cuentan SOLO donde esta identidad puede gestionar
 * (si no, no podría confirmarlos): sin ninguno así → 0 real.
 */
export async function patrimonioParaInicio(identidadId: string): Promise<{ inmuebles: number | null; pendientes: number | null; puedeConfirmar: boolean } | null | undefined> {
  let accesos: AccesosMapa
  try {
    accesos = await accesosPatrimonio(identidadId)
  } catch (e) {
    console.error('[inicio] patrimonio sin comprobar:', e instanceof Error ? e.message : e)
    return null
  }
  if (accesos.size === 0) return undefined
  const ids = [...accesos.keys()]
  const gestionables = ids.filter((id) => puede(accesos.get(id), 'gestionar_gastos_documentos'))
  let titulares: { id: string; clienteId: string }[] | null = null
  try {
    titulares = await prisma.portalPatrimonioTitular.findMany({ where: { clienteId: { in: ids }, archivadoEn: null }, select: { id: true, clienteId: true } })
  } catch (e) {
    console.error('[inicio] titulares de patrimonio sin leer:', e instanceof Error ? e.message : e)
  }
  if (titulares === null) return { inmuebles: null, pendientes: null, puedeConfirmar: gestionables.length > 0 }
  const todosIds = titulares.map((t) => t.id)
  const gestIds = titulares.filter((t) => gestionables.includes(t.clienteId)).map((t) => t.id)
  const [rInm, rPend] = await Promise.allSettled([
    prisma.portalPatrimonioInmueble.count({ where: { titularId: { in: todosIds }, archivadoEn: null } }),
    gestIds.length === 0 ? Promise.resolve(0) : prisma.portalPatrimonioGasto.count({ where: { titularId: { in: gestIds }, estado: 'propuesto' } }),
  ])
  const val = (r: PromiseSettledResult<number>, f: string) => {
    if (r.status === 'fulfilled') return r.value
    console.error(`[inicio] patrimonio «${f}» sin leer:`, r.reason instanceof Error ? r.reason.message : r.reason)
    return null
  }
  return { inmuebles: val(rInm, 'inmuebles'), pendientes: val(rPend, 'pendientes'), puedeConfirmar: gestionables.length > 0 }
}
