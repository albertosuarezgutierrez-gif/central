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
  type ResumenSegurosPatrimonio,
  type TipoPolizaEnlace,
} from '@central/module-patrimonio'

import { carteraDeIdentidad, type CarteraPortal } from '../cartera-lectura'
import { prisma } from '../db'
import { DECLARADA_NO_ELIMINADA } from '../declaradas-eliminadas'
import { getIdentidad } from '../session'
import { accesosPatrimonio } from './accesos'
import { estadosDeInmuebles, type InmuebleDeSeguros, type PolizaVisible, type PuertosSegurosInmueble } from './seguros-inmueble-api'

const fechaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

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
      })
    }
  }
  return [...vistas.values()]
}

type FilaDeclaradaVisible = {
  id: string; compania: string | null; ramo: string | null; fechaVencimiento: Date | null; vigenteDeclarada: string | null
  eliminadaEn: Date | null; referenciaCatastral: string | null; datosRamo: unknown
}

/** Las declaradas PROPIAS (quien llama ya las leyó con `identidadId` en el `where`). */
export function visiblesDeDeclaradas(filas: readonly FilaDeclaradaVisible[], hoy: Date): PolizaVisible[] {
  return filas.map((d) => ({
    tipo: 'declarada' as const, id: d.id, compania: d.compania, ramo: d.ramo,
    ubicacion: direccionDeclarada(d.datosRamo), referenciaCatastral: d.referenciaCatastral,
    vence: fechaIso(d.fechaVencimiento),
    vigente: declaradaVigente(d, hoy),
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
        sinSeguroDeclaradoEn: true, titular: { select: { clienteId: true } },
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
      const f = r.fila
      return {
        id: f.id, alias: f.alias, nivel: r.nivel, enComunidad: f.enComunidad, sinSeguroDeclaradoEn: f.sinSeguroDeclaradoEn,
        referenciaCatastral: f.referenciaCatastral, cp: f.cp, via: f.via, numero: f.numero,
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
            referenciaCatastral: true, datosRamo: true,
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
