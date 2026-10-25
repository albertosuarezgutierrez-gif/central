// PATRIMONIO (22/10/2026, paso 9) — adaptador con BD de contratos, inquilinos y actualización de renta.
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`); el contrato, el inmueble o el
// inquilino de la URL NUNCA consultan por sí solos: se buscan DENTRO de los titulares autorizados (`titular.clienteId in
// accesos`). Sin RLS, un `where` de menos devuelve el contrato de cualquiera. La BD lo repite con FK compuestas
// `(…, titular_id)`. La PII del inquilino NO pasa por aquí: va por `inquilinos-puente.ts` (el rol no tiene ni las
// columnas ni la clave). La renta aplicada es APPEND-ONLY: aquí solo hay `create`, nunca `update`/`delete`.
import { Prisma } from '@prisma/client'
import {
  preferenciaDeColumnas,
  proximoAniversarioActualizacion,
  puede,
  topeAplicable,
  type Contrato,
  type IndiceActualizacion,
  type NivelPatrimonio,
  type PreferenciaTope,
  type ResultadoActualizacion,
  type TopeAplicable,
} from '@central/module-patrimonio'

import { prisma } from '../db'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { propuestaDeContrato, type PuertosContratos } from './contratos-api'
import { fechaMadrid } from './dia-madrid'
import type { FilaIndice } from './indices'
import { altaInquilinoPorPuente, piiInquilinoPorPuente } from './inquilinos-puente'
import { contratoDeFila, decimal, inquilinoDeFila, type FilaContrato } from './lectura'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const aFecha = (f: string | null) => (f === null ? null : new Date(`${f}T00:00:00Z`))

/** El `where` del contrato pedido DENTRO de los titulares autorizados (y sin archivar). */
const contratoDentro = (id: string, clientesIds: readonly string[]) => ({
  id,
  archivadoEn: null,
  inmueble: { archivadoEn: null, titular: { clienteId: { in: [...clientesIds] }, archivadoEn: null } },
})

const INCLUDE_CONTRATO = {
  inmueble: { select: { id: true, alias: true, titular: { select: { clienteId: true } } } },
  inquilinos: {
    where: { archivadoEn: null },
    select: { papel: true, inquilino: { select: { id: true, tipo: true, nombre: true, emailHash: true, archivadoEn: true } } },
  },
  actualizaciones: { orderBy: { desde: 'asc' as const } },
}

async function leerContrato(id: string, clientesIds: readonly string[]) {
  if (!UUID.test(id) || clientesIds.length === 0) return null
  return prisma.portalPatrimonioContrato.findFirst({ where: contratoDentro(id, clientesIds), include: INCLUDE_CONTRATO })
}
type FilaLeida = NonNullable<Awaited<ReturnType<typeof leerContrato>>>

/** Lo que el cliente dejó en las columnas del tope; sin nada (o roto) = el catálogo. */
function topeDeFila(f: FilaLeida): PreferenciaTope {
  return preferenciaDeColumnas(decimal(f.topeActualizacionPct), f.topeActualizacionSin)
}

function contratoPuro(f: FilaLeida): Contrato {
  const vivos = f.inquilinos.filter((ci) => ci.inquilino.archivadoEn === null)
  return contratoDeFila(f as FilaContrato, vivos.map((ci) => ci.inquilino.id), f.actualizaciones)
}

async function filasIndice(indice: IndiceActualizacion): Promise<FilaIndice[]> {
  if (indice !== 'IPC' && indice !== 'IRAV') return []
  // Tabla GLOBAL (no es de ningún titular): solo se lee después de resolver los accesos del contrato. Dos años bastan
  // para cualquier aniversario que toque hoy.
  const filas = await prisma.portalPatrimonioIndice.findMany({
    where: { indice },
    orderBy: [{ periodo: 'desc' }, { descargadoEn: 'desc' }],
    take: 60,
    select: { indice: true, periodo: true, pct: true, descargadoEn: true },
  })
  return filas.map((f) => ({ indice: f.indice, periodo: f.periodo, pct: decimal(f.pct) ?? Number.NaN, descargadoEn: f.descargadoEn }))
}

export function puertosContratos(identidadId: string): PuertosContratos {
  let cache: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const accesos = async () => (cache ??= await accesosPatrimonio(identidadId))
  return {
    accesos,
    hoy: () => fechaMadrid(new Date()),
    async inmueble(id, clientesIds) {
      const f = await prisma.portalPatrimonioInmueble.findFirst({
        where: { id, archivadoEn: null, titular: { clienteId: { in: [...clientesIds] }, archivadoEn: null } },
        select: { titularId: true, titular: { select: { clienteId: true } } },
      })
      return f ? { clienteId: f.titular.clienteId, titularId: f.titularId } : null
    },
    async contrato(id, clientesIds) {
      const f = await leerContrato(id, clientesIds)
      return f ? { clienteId: f.inmueble.titular.clienteId, contrato: contratoPuro(f), tope: topeDeFila(f) } : null
    },
    async inquilino(id, clientesIds) {
      const f = await prisma.portalPatrimonioInquilino.findFirst({
        where: { id, archivadoEn: null, titular: { clienteId: { in: [...clientesIds] }, archivadoEn: null } },
        select: { id: true, titular: { select: { clienteId: true } } },
      })
      return f ? { clienteId: f.titular.clienteId, inquilinoId: f.id } : null
    },
    async crearContrato({ titularId, inmuebleId, datos }) {
      const c = await prisma.portalPatrimonioContrato.create({
        data: {
          titularId,
          inmuebleId,
          inicio: aFecha(datos.inicio)!,
          fin: aFecha(datos.fin),
          rentaMensualCent: BigInt(datos.rentaMensualCent),
          clausula: datos.clausula,
          indice: datos.indice,
          indiceDescripcion: datos.indiceDescripcion,
          fianzaCent: datos.fianzaCent === null ? null : BigInt(datos.fianzaCent),
          fianzaDepositadaEn: aFecha(datos.fianzaDepositadaEn),
          fianzaOrganismo: datos.fianzaOrganismo,
          seguroInquilinoExigido: datos.seguroInquilinoExigido,
          seguroInquilinoVence: aFecha(datos.seguroInquilinoVence),
          creadoPorIdentidadId: identidadId,
        },
        select: { id: true },
      })
      return c
    },
    indices: filasIndice,
    async guardarTope({ contratoId, tope }) {
      // `contratoId` viene de `p.contrato()` (ya dentro de los titulares autorizados); se repite el filtro por titular.
      const acc = await accesosPatrimonio(identidadId)
      if (acc.size === 0) return
      await prisma.portalPatrimonioContrato.updateMany({
        where: contratoDentro(contratoId, [...acc.keys()]),
        data: {
          topeActualizacionPct: tope.modo === 'propio' ? new Prisma.Decimal(tope.pct.toFixed(2)) : null,
          topeActualizacionSin: tope.modo === 'sin_tope' ? true : null,
          topeActualizacionPorIdentidadId: tope.modo === 'defecto' ? null : identidadId,
          topeActualizacionEn: tope.modo === 'defecto' ? null : new Date(),
        },
      })
    },
    async aplicarRenta({ contratoId, propuesta }) {
      try {
        const r = await prisma.portalPatrimonioRentaActualizacion.create({
          data: {
            contratoId,
            desde: aFecha(propuesta.aplicableDesde)!,
            rentaMensualCent: BigInt(propuesta.rentaNueva),
            indice: propuesta.indice,
            pctAplicado: new Prisma.Decimal(propuesta.pctAplicado.toFixed(3)),
            periodo: propuesta.periodo,
            topado: propuesta.topado,
            creadoPorIdentidadId: identidadId,
          },
          select: { id: true },
        })
        return { ok: true, id: r.id }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, motivo: 'duplicado' }
        throw e
      }
    },
    altaInquilinoPuente: ({ contratoId, datos }) => altaInquilinoPorPuente(identidadId, contratoId, datos),
    piiInquilinoPuente: (inquilinoId) => piiInquilinoPorPuente(identidadId, inquilinoId),
  }
}

// ─── Lectura para las pantallas ───────────────────────────────────────────────────────────────────────────────

export type InquilinoVista = { id: string; tipo: string; nombre: string; papel: string; conCorreo: boolean }
export type RentaVista = { desde: string; rentaMensualCent: number; indice: string | null; pctAplicado: number | null; periodo: string | null; topado: boolean | null; notificada: boolean }

export type FichaContrato = {
  contrato: Contrato
  fianzaOrganismo: string | null
  inmueble: { id: string; alias: string }
  clienteId: string
  nivel: NivelPatrimonio
  puedeAltaBaja: boolean
  puedeVerPii: boolean
  inquilinos: InquilinoVista[]
  historial: RentaVista[]
  propuesta: ResultadoActualizacion
  /** Lo que el cliente fijó y el tope que se aplicaría al aniversario que toca (con su fuente). */
  topePreferencia: PreferenciaTope
  topeAplicable: TopeAplicable | null
}

/** El contrato del id de la URL SOLO si cuelga de un titular autorizado. `null` = 404 (no existe o no es tuyo). */
export async function contratoAutorizado(identidadId: string, idPedido: string): Promise<FichaContrato | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return null
  const f = await leerContrato(idPedido, [...accesos.keys()])
  if (!f) return null
  const clienteId = f.inmueble.titular.clienteId
  const nivel = accesos.get(clienteId)
  if (!nivel) return null
  const contrato = contratoPuro(f)
  const p = puertosContratos(identidadId)
  return {
    contrato,
    fianzaOrganismo: f.fianzaOrganismo,
    inmueble: { id: f.inmueble.id, alias: f.inmueble.alias },
    clienteId,
    nivel,
    puedeAltaBaja: puede(nivel, 'alta_baja'),
    puedeVerPii: puede(nivel, 'ver_pii_inquilino'),
    inquilinos: f.inquilinos
      .filter((ci) => ci.inquilino.archivadoEn === null)
      .map((ci) => {
        const q = inquilinoDeFila(ci.inquilino)
        return { id: q.id, tipo: q.tipo, nombre: q.nombre, papel: ci.papel, conCorreo: ci.inquilino.emailHash !== null }
      }),
    historial: f.actualizaciones.map((a) => ({
      desde: a.desde.toISOString().slice(0, 10),
      rentaMensualCent: Number(a.rentaMensualCent),
      indice: a.indice,
      pctAplicado: decimal(a.pctAplicado),
      periodo: a.periodo,
      topado: a.topado,
      notificada: a.notificadaEn !== null,
    })),
    propuesta: await propuestaDeContrato(p, contrato, topeDeFila(f)),
    topePreferencia: topeDeFila(f),
    topeAplicable: contrato.clausula.tipo === 'indice' ? topeAplicable(proximoAniversarioActualizacion(contrato), topeDeFila(f)) : null,
  }
}

export type ContratoResumen = { id: string; inicio: string; fin: string | null; terminadoEn: string | null; rentaMensualCent: number }

/** Contratos (sin archivar) de un inmueble, buscados DENTRO de los titulares autorizados. */
export async function contratosDelInmueble(identidadId: string, inmuebleId: string): Promise<ContratoResumen[]> {
  if (!UUID.test(inmuebleId)) return []
  if ((await getIdentidad())?.id !== identidadId) return []
  const accesos = await accesosPatrimonio(identidadId)
  if (accesos.size === 0) return []
  const filas = await prisma.portalPatrimonioContrato.findMany({
    where: {
      inmuebleId,
      archivadoEn: null,
      inmueble: { archivadoEn: null, titular: { clienteId: { in: [...accesos.keys()] }, archivadoEn: null } },
    },
    orderBy: { inicio: 'desc' },
    take: 50,
    select: { id: true, inicio: true, fin: true, terminadoEn: true, rentaMensualCent: true },
  })
  return filas.map((c) => ({
    id: c.id,
    inicio: c.inicio.toISOString().slice(0, 10),
    fin: c.fin ? c.fin.toISOString().slice(0, 10) : null,
    terminadoEn: c.terminadoEn ? c.terminadoEn.toISOString().slice(0, 10) : null,
    rentaMensualCent: Number(c.rentaMensualCent),
  }))
}
