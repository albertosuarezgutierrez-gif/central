// PATRIMONIO (24/10/2026, P11) — puertos con BD de los SEGUROS de un inmueble (`seguros-inmueble-api.ts`).
//
// 🚨 TODA función parte de `accesosPatrimonio(identidadId)` (cookie + `portal_vinculo`), y la sesión tiene que ser la
// de `identidadId` (defensa en profundidad). El inmueble se busca DENTRO de los titulares autorizados; las pólizas
// que «ve» esta identidad salen de `carteraDeIdentidad()` (la misma lectura de la bóveda, a su NIVEL: la dirección
// llega `null` donde no la puede ver) y de SUS declaradas no eliminadas (`identidadId` en el `where`). Nada de un
// id del cuerpo llega a un `findUnique`: los ids de póliza que se escriben son ids que ya están en esas listas.
// Sin RLS: un `where` de menos devolvería el patrimonio de cualquiera. Cepo `regression-portal-patrimonio-aislamiento`.
import { Prisma } from '@prisma/client'
import { esCarteraEnVigor } from '@central/module-seguros'
import {
  declaradaVigente,
  resumenSegurosPatrimonio,
  type EstadoDecisionSeguro,
  type OrigenEnlace,
  type PrimaSeguroInmueble,
  type NivelPatrimonio,
  type ResumenSegurosPatrimonio,
  type TipoPolizaEnlace,
} from '@central/module-patrimonio'

import { carteraDeIdentidad, type CarteraPortal } from '../cartera-lectura'
import { prisma } from '../db'
import { DECLARADA_NO_ELIMINADA } from '../declaradas-eliminadas'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { cacheDeCatastro, debeConsultarCatastro } from './catastro-inmueble'
import { primasDeEnlaces } from './rentabilidad'
import { capitalContinenteDeCartera, capitalContinenteDeDeclarada } from './capital-continente'
import { estadosDeInmuebles, type FilaEnlace, type InmuebleDeSeguros, type PolizaVisible, type PuertosSegurosInmueble } from './seguros-inmueble-api'

const fechaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const eurosACent = (e: number | null) => (typeof e === 'number' && Number.isFinite(e) && e > 0 ? Math.round(e * 100) : null)

/** La dirección que el cliente escribió en una declarada de hogar/comercio/comunidad (`datos_ramo.direccion`). */
function direccionDeclarada(datosRamo: unknown): string | null {
  if (typeof datosRamo !== 'object' || datosRamo === null || Array.isArray(datosRamo)) return null
  const d = (datosRamo as Record<string, unknown>).direccion
  return typeof d === 'string' && d.trim() !== '' ? d.trim() : null
}

/** Las pólizas de la cartera que ve esta identidad, A SU NIVEL (la dirección llega `null` donde no la ve). */
export function visiblesDeCartera(c: CarteraPortal): PolizaVisible[] {
  const vistas = new Map<string, PolizaVisible>()
  for (const t of [...c.propias, ...c.autorizadas, ...c.intervinientes]) {
    for (const p of t.polizas) {
      if (vistas.has(p.id)) continue
      vistas.set(p.id, {
        tipo: 'cartera', id: p.id, compania: p.compania || null, ramo: p.ramo, ubicacion: p.bien.ubicacion,
        referenciaCatastral: null, vence: fechaIso(p.fechaVencimiento),
        vigente: esCarteraEnVigor({ ...p.procedencia, estado: p.estado, sustituidaAt: p.sustituidaAt }),
        // `coberturas`/`prima` `null` = no visible a este nivel: no consta (nunca 0). La prima dudosa ya viene `null`.
        capitalContinenteCent: capitalContinenteDeCartera(p.coberturas),
        costeAnualCent: eurosACent(p.prima?.bruta ?? p.prima?.anual ?? null),
        desde: fechaIso(p.fechaEfectoActual),
      })
    }
  }
  return [...vistas.values()]
}

type FilaDeclaradaVisible = {
  id: string; compania: string | null; ramo: string | null; fechaVencimiento: Date | null; vigenteDeclarada: string | null
  eliminadaEn: Date | null; referenciaCatastral: string | null; datosRamo: unknown
  /** Solo la rentabilidad la pide; `Decimal` de Prisma (`toString()`), euros. */
  primaAnual?: { toString(): string } | null
}

/** Las declaradas PROPIAS (quien llama ya las leyó con `identidadId` en el `where`). */
export function visiblesDeDeclaradas(filas: readonly FilaDeclaradaVisible[], hoy: Date): PolizaVisible[] {
  return filas.map((d) => ({
    tipo: 'declarada' as const, id: d.id, compania: d.compania, ramo: d.ramo,
    ubicacion: direccionDeclarada(d.datosRamo), referenciaCatastral: d.referenciaCatastral,
    vence: fechaIso(d.fechaVencimiento),
    vigente: declaradaVigente(d, hoy),
    capitalContinenteCent: capitalContinenteDeDeclarada(d.datosRamo),
    costeAnualCent: d.primaAnual === undefined || d.primaAnual === null ? null : eurosACent(Number(d.primaAnual.toString())),
    // La declarada no guarda el efecto: la anualidad es la que termina en su vencimiento.
    desde: null,
  }))
}

/**
 * Tarjeta «Patrimonio» de Inicio: el estado de seguro de cada inmueble que ve esta identidad, contado.
 * `null` = esta identidad no tiene patrimonio a la vista (`accesosPatrimonio` vacío). `visibles` lo trae Inicio de
 * la MISMA cartera que ya leyó (no se lee dos veces). Lanza si la BD falla: Inicio lo convierte en «sin comprobar».
 */
export async function resumenPatrimonio(identidadId: string, visibles: readonly PolizaVisible[]): Promise<ResumenSegurosPatrimonio | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return null
  const inmuebles = await prisma.portalPatrimonioInmueble.findMany({
    where: { archivadoEn: null, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
    select: { id: true, sinSeguroDeclaradoEn: true },
  })
  if (inmuebles.length === 0) return resumenSegurosPatrimonio([])
  // Los ids salen de la consulta de arriba (titulares autorizados), nunca de la request.
  const filas = await prisma.portalPatrimonioInmueblePoliza.findMany({
    where: { inmuebleId: { in: inmuebles.map((i) => i.id) }, archivadoEn: null },
    select: { id: true, inmuebleId: true, polizaId: true, polizaDeclaradaId: true, estado: true, origen: true },
  })
  return resumenSegurosPatrimonio(estadosDeInmuebles(inmuebles, filas, visibles))
}

/**
 * Inmuebles vivos de los titulares autorizados y sus enlaces vivos, para el aviso «póliza sin inmueble» (25/10/2026).
 * La tabla puente tiene UNA puerta (este fichero): `poliza-sin-inmueble-bd.ts` pasa por aquí. Los ids de inmueble salen de la
 * consulta de titulares autorizados, nunca de la request. Lanza si la BD falla.
 */
export async function inmueblesYEnlacesDeIdentidad(identidadId: string) {
  if ((await getIdentidad())?.id !== identidadId) return { acc: new Map<string, NivelPatrimonio>(), inmuebles: [], filas: [] }
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0) return { acc, inmuebles: [], filas: [] }
  const inmuebles = await prisma.portalPatrimonioInmueble.findMany({
    where: { archivadoEn: null, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
    select: { id: true, referenciaCatastral: true, cp: true, via: true, numero: true, titular: { select: { clienteId: true } } },
  })
  const filas = inmuebles.length === 0 ? [] : await prisma.portalPatrimonioInmueblePoliza.findMany({
    where: { inmuebleId: { in: inmuebles.map((i) => i.id) }, archivadoEn: null },
    select: { inmuebleId: true, polizaId: true, polizaDeclaradaId: true, estado: true },
  })
  return { acc, inmuebles, filas }
}

/**
 * Primas de las pólizas ENLAZADAS a esos inmuebles (rentabilidad, P14). Los ids de inmueble se vuelven a acotar DENTRO de
 * los titulares autorizados (los que pida quien llama no se fían). `null` = cartera o declaradas ilegibles (la
 * rentabilidad dirá «el número no incluye seguros»). Lanza si la BD falla.
 */
export async function primasDeInmuebles(
  identidadId: string,
  inmuebleIds: readonly string[],
  periodo: { desde: string; hasta: string },
): Promise<PrimaSeguroInmueble[] | null> {
  if ((await getIdentidad())?.id !== identidadId) return null
  const acc = await accesosPatrimonio(identidadId)
  if (acc.size === 0 || inmuebleIds.length === 0) return []
  const propios = await prisma.portalPatrimonioInmueble.findMany({
    where: { id: { in: [...inmuebleIds] }, archivadoEn: null, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
    select: { id: true },
  })
  if (propios.length === 0) return []
  const filas = await prisma.portalPatrimonioInmueblePoliza.findMany({
    where: { inmuebleId: { in: propios.map((i) => i.id) }, archivadoEn: null },
    select: { id: true, inmuebleId: true, polizaId: true, polizaDeclaradaId: true, estado: true, origen: true },
  })
  const vis = await puertosSegurosInmueble(identidadId).visibles()
  if (vis.cartera === null || vis.declaradas === null) return null
  return primasDeEnlaces(filas, [...vis.cartera, ...vis.declaradas], periodo)
}

type FilaConCatastro = {
  id: string; uso: string; referenciaCatastral: string | null
  catastroSuperficieM2: unknown; catastroTipoVivienda: string | null; catastroConsultadoEn: Date | null; catastroEstado: string | null
}

/**
 * Caché del Catastro (25/10/2026): si la del inmueble ya caducó, se pregunta UNA vez y se guarda; si no, no se llama. El
 * fallo de la consulta o del guardado nunca tumba la ficha: se sigue con lo que había (estimación = «sin dato»). Solo se
 * llama con una fila que YA salió de un titular autorizado.
 */
async function conCatastroAlDia<T extends FilaConCatastro>(f: T): Promise<T> {
  const ahora = new Date()
  if (!debeConsultarCatastro({ referenciaCatastral: f.referenciaCatastral, uso: f.uso, estado: f.catastroEstado, consultadoEn: f.catastroConsultadoEn, ahora })) return f
  try {
    const { bajarCatastro } = await import('@central/core-catastro/http')
    const c = cacheDeCatastro(await bajarCatastro(f.referenciaCatastral as string).catch(() => null))
    await prisma.portalPatrimonioInmueble.updateMany({
      where: { id: f.id, archivadoEn: null },
      data: { catastroSuperficieM2: c.superficieM2, catastroTipoVivienda: c.tipoVivienda, catastroConsultadoEn: ahora, catastroEstado: c.estado },
    })
    return { ...f, catastroSuperficieM2: c.superficieM2, catastroTipoVivienda: c.tipoVivienda, catastroConsultadoEn: ahora, catastroEstado: c.estado } as T
  } catch (e) {
    console.error('[patrimonio] caché del Catastro no actualizada:', e instanceof Error ? e.message : 'error')
    return f
  }
}

/**
 * Enlaces VIVOS (sin archivar) de esos inmuebles, acotados DENTRO de los titulares que pasa quien llama (que salen de
 * `accesosPatrimonio`). Para «¿Esto lo cubre tu seguro?» (`cubre-seguro-bd.ts`): la tabla puente tiene UNA puerta, esta.
 */
export async function enlacesVivosDeInmuebles(titularIds: readonly string[], inmuebleIds: readonly string[]): Promise<(FilaEnlace & { inmuebleId: string })[]> {
  if (titularIds.length === 0 || inmuebleIds.length === 0) return []
  return prisma.portalPatrimonioInmueblePoliza.findMany({
    where: { inmuebleId: { in: [...inmuebleIds] }, archivadoEn: null, inmueble: { titularId: { in: [...titularIds] }, archivadoEn: null } },
    select: { id: true, inmuebleId: true, polizaId: true, polizaDeclaradaId: true, estado: true, origen: true },
  })
}

export function puertosSegurosInmueble(identidadId: string): PuertosSegurosInmueble {
  let accesos: Awaited<ReturnType<typeof accesosPatrimonio>> | null = null
  const misAccesos = async () => (accesos ??= await accesosPatrimonio(identidadId))
  const sesionEsLaMia = async () => (await getIdentidad())?.id === identidadId

  /** El inmueble SOLO dentro de los titulares autorizados (y vivo). `null` = 404. */
  async function inmuebleAutorizadoId(idPedido: string) {
    const acc = await misAccesos()
    if (acc.size === 0) return null
    const fila = await prisma.portalPatrimonioInmueble.findFirst({
      where: { id: idPedido, archivadoEn: null, titular: { clienteId: { in: [...acc.keys()] }, archivadoEn: null } },
      select: {
        id: true, alias: true, referenciaCatastral: true, cp: true, via: true, numero: true, enComunidad: true,
        sinSeguroDeclaradoEn: true, valorReconstruccionEstimadoCent: true, titular: { select: { clienteId: true } },
        uso: true, catastroSuperficieM2: true, catastroTipoVivienda: true, catastroConsultadoEn: true, catastroEstado: true,
        presidenteComunidad: true,
      },
    })
    if (!fila) return null
    const nivel = acc.get(fila.titular.clienteId)
    return nivel ? { fila, nivel } : null
  }

  return {
    async inmueble(idPedido): Promise<InmuebleDeSeguros | null> {
      if (!(await sesionEsLaMia())) return null
      const r = await inmuebleAutorizadoId(idPedido)
      if (!r) return null
      const f = await conCatastroAlDia(r.fila)
      return {
        id: f.id, alias: f.alias, nivel: r.nivel, enComunidad: f.enComunidad, sinSeguroDeclaradoEn: f.sinSeguroDeclaradoEn,
        referenciaCatastral: f.referenciaCatastral, cp: f.cp, via: f.via, numero: f.numero,
        valorReconstruccionCent: f.valorReconstruccionEstimadoCent === null ? null : Number(f.valorReconstruccionEstimadoCent),
        uso: f.uso,
        superficieCatastroM2: f.catastroSuperficieM2 === null ? null : Number(f.catastroSuperficieM2),
        tipoCatastro: f.catastroTipoVivienda === 'piso' || f.catastroTipoVivienda === 'unifamiliar' ? f.catastroTipoVivienda : null,
        presidenteComunidad: f.presidenteComunidad,
      }
    },

    async enlaces(inmuebleId) {
      // `inmuebleId` sale de `inmueble()` (ya autorizado); se vuelve a comprobar por si alguien llama sin pasar por ahí.
      if (!(await inmuebleAutorizadoId(inmuebleId))) return []
      return prisma.portalPatrimonioInmueblePoliza.findMany({
        where: { inmuebleId, archivadoEn: null },
        select: { id: true, polizaId: true, polizaDeclaradaId: true, estado: true, origen: true },
        orderBy: { creadoEn: 'asc' },
      })
    },

    async visibles() {
      const hoy = new Date()
      const [cartera, declaradas] = await Promise.allSettled([
        carteraDeIdentidad(identidadId),
        prisma.portalPolizaDeclarada.findMany({
          where: { identidadId, ...DECLARADA_NO_ELIMINADA },
          select: {
            id: true, compania: true, ramo: true, fechaVencimiento: true, vigenteDeclarada: true, eliminadaEn: true,
            referenciaCatastral: true, datosRamo: true, primaAnual: true,
          },
        }),
      ])
      let deCartera: PolizaVisible[] | null = null
      if (cartera.status === 'fulfilled') {
        deCartera = visiblesDeCartera(cartera.value)
      } else {
        console.error('[patrimonio/seguros] no se pudo leer la cartera:', cartera.reason instanceof Error ? cartera.reason.message : cartera.reason)
      }
      let deDeclaradas: PolizaVisible[] | null = null
      if (declaradas.status === 'fulfilled') {
        deDeclaradas = visiblesDeDeclaradas(declaradas.value, hoy)
      } else {
        console.error('[patrimonio/seguros] no se pudieron leer las declaradas:', declaradas.reason instanceof Error ? declaradas.reason.message : declaradas.reason)
      }
      return { cartera: deCartera, declaradas: deDeclaradas }
    },

    async crearEnlace(x: { inmuebleId: string; tipo: TipoPolizaEnlace; polizaId: string; estado: EstadoDecisionSeguro; origen: OrigenEnlace }) {
      if (!(await sesionEsLaMia()) || !(await inmuebleAutorizadoId(x.inmuebleId))) return 'duplicado'
      const par = x.tipo === 'cartera' ? { polizaId: x.polizaId } : { polizaDeclaradaId: x.polizaId }
      try {
        await prisma.$transaction(async (tx) => {
          // Cambiar de opinión sobre un «No es este» = archivarlo y crear la nueva decisión (estado no se reescribe).
          if (x.estado === 'confirmado') {
            await tx.portalPatrimonioInmueblePoliza.updateMany({
              where: { inmuebleId: x.inmuebleId, ...par, estado: 'rechazado', archivadoEn: null },
              data: { archivadoEn: new Date() },
            })
          }
          await tx.portalPatrimonioInmueblePoliza.create({
            data: { inmuebleId: x.inmuebleId, ...par, estado: x.estado, origen: x.origen, creadoPorIdentidadId: identidadId },
            select: { id: true },
          })
        })
        return 'ok'
      } catch (e) {
        // El índice único parcial (una decisión viva por par) decide la carrera entre dos pulsaciones.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'duplicado'
        throw e
      }
    },

    async archivarEnlace(inmuebleId, enlaceId) {
      if (!(await sesionEsLaMia()) || !(await inmuebleAutorizadoId(inmuebleId))) return false
      const r = await prisma.portalPatrimonioInmueblePoliza.updateMany({
        where: { id: enlaceId, inmuebleId, archivadoEn: null },
        data: { archivadoEn: new Date() },
      })
      return r.count === 1
    },

    async declararPresidenteComunidad(inmuebleId, valor) {
      if (!(await sesionEsLaMia()) || !(await inmuebleAutorizadoId(inmuebleId))) return
      await prisma.portalPatrimonioInmueble.updateMany({ where: { id: inmuebleId, archivadoEn: null }, data: { presidenteComunidad: valor } })
    },

    async declararSinSeguro(inmuebleId, valor) {
      if (!(await sesionEsLaMia()) || !(await inmuebleAutorizadoId(inmuebleId))) return
      await prisma.portalPatrimonioInmueble.updateMany({
        where: { id: inmuebleId, archivadoEn: null },
        data: valor
          ? { sinSeguroDeclaradoEn: new Date(), sinSeguroDeclaradoPorIdentidadId: identidadId }
          : { sinSeguroDeclaradoEn: null, sinSeguroDeclaradoPorIdentidadId: null },
      })
    },
  }
}
