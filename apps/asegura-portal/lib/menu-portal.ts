/**
 * Qué entradas del menú se OFRECEN a esta sesión (26/10/2026, «menú adaptado por tipo»). Lee los hechos con la BD y
 * deja la decisión a la regla pura (`entradasVisibles` & co. de `@central/module-seguros-portal/menu-visible`).
 *
 * 🚨 SOLO VISIBILIDAD. Esto no abre ni cierra ninguna pantalla: cada una sigue resolviendo su acceso por su cuenta
 * (`accesosPatrimonio`, `accesosFlota`, `carteraDeIdentidad`…). Un enlace que no se ofrece sigue sin dar acceso a nada
 * y uno que se ofrece no lo concede.
 *
 * Tres estados: cada lectura que falla vale `null` («no se ha podido comprobar») y un `null` NUNCA oculta una entrada.
 * La identidad sale SIEMPRE de la cookie (`getIdentidad`), nunca de un parámetro. `cache()` de React: el layout raíz
 * (cabecera) y el del portal (menú) piden lo mismo en la misma petición y lo leen una sola vez.
 */
import { cache } from 'react'

import {
  ALCANCE_FLOTA,
  NIVELES,
  contactosEnCuenta,
  entradasVisibles,
  estadoAutorizacion,
  herramientasVisibles,
  puedeAutorizar,
  type HechosMenu,
  type HerramientasVisibles,
  type Nivel,
  type SeccionPortal,
} from '@central/module-seguros-portal'
import { ALCANCES_PATRIMONIO } from '@central/module-patrimonio'

import { prisma } from './db'
import { DECLARADA_NO_ELIMINADA } from './declaradas-eliminadas'
import { accesosFlota, nombramientosPendientes } from './flota'
import { accesosPatrimonio } from './patrimonio/accesos'
import { getIdentidad } from './session'

export type MenuDeSesion = {
  /** Los hechos tal cual (tres estados), para `puertaAbierta()` en `lib/puertas-portal.ts`. */
  hechos: HechosMenu
  visibles: SeccionPortal[]
  herramientas: HerramientasVisibles
  /** «Contactos» no está en el menú de esta persona: se ofrece dentro de «Cuenta». */
  contactosEnCuenta: boolean
}

function nivelDe(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

function leyo<T>(r: PromiseSettledResult<T>, que: string): T | null {
  if (r.status === 'fulfilled') return r.value
  console.error(`[portal/menu] no se pudo comprobar ${que}:`, r.reason instanceof Error ? r.reason.message : r.reason)
  return null
}

/** Los hechos de ESTA identidad. Cada uno `null` si su lectura falló. */
export async function hechosDeMenu(identidadId: string): Promise<HechosMenu> {
  const [vinculos, aportadas, patrimonio, flota, nombramientos] = await Promise.allSettled([
    prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true, nivel: true } }),
    prisma.portalPolizaDeclarada.count({ where: { identidadId, ...DECLARADA_NO_ELIMINADA } }),
    accesosPatrimonio(identidadId),
    accesosFlota(identidadId),
    nombramientosPendientes(identidadId),
  ])
  const v = leyo(vinculos, 'los vínculos')

  // Autorizaciones recibidas por aceptar (todas menos el nombramiento de jefe de flota, que se acepta en /flota).
  let porAceptar: number | null = null
  if (v !== null) {
    try {
      const propias = v.map((x) => x.clienteId)
      const filas = await prisma.portalAutorizacion.findMany({
        where: {
          alcance: { not: ALCANCE_FLOTA },
          revocadoEn: null,
          aceptadoEn: null,
          OR: [
            { autorizadoIdentidadId: identidadId },
            ...(propias.length > 0 ? [{ autorizadoClienteId: { in: propias } }] : []),
          ],
        },
        select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
        take: 50,
      })
      const hoy = new Date()
      porAceptar = filas.filter((f) => estadoAutorizacion(f, hoy) === 'pendiente').length
    } catch (e) {
      console.error('[portal/menu] no se pudo comprobar lo pendiente de aceptar:', e instanceof Error ? e.message : e)
    }
  }

  // 27/10/2026: accesos de PATRIMONIO que me han dado y siguen vigentes (se ven y se dejan en «Contactos»). Mismas dos ramas
  // que `accesosPatrimonio`: mi identidad o una ficha mía. `null` = no se pudo comprobar (no oculta nada).
  let patrimonioRecibido: number | null = null
  if (v !== null) {
    try {
      const propias = v.map((x) => x.clienteId)
      const filas = await prisma.portalAutorizacion.findMany({
        where: {
          alcance: { in: [...ALCANCES_PATRIMONIO] },
          polizaId: null,
          revocadoEn: null,
          OR: [
            { autorizadoIdentidadId: identidadId },
            ...(propias.length > 0 ? [{ autorizadoClienteId: { in: propias } }] : []),
          ],
        },
        select: { aceptadoEn: true, caducaEn: true, revocadoEn: true },
        take: 50,
      })
      const hoy = new Date()
      patrimonioRecibido = filas.filter((f) => estadoAutorizacion(f, hoy) === 'vigente').length
    } catch (e) {
      console.error('[portal/menu] no se pudo comprobar el patrimonio recibido:', e instanceof Error ? e.message : e)
    }
  }

  const accesosFlotaLeidos = leyo(flota, 'la flota')
  const nombramientosLeidos = leyo(nombramientos, 'los nombramientos de flota')
  return {
    fichasPropias: v === null ? null : v.length,
    polizasAportadas: leyo(aportadas, 'las pólizas aportadas'),
    patrimonio: (() => {
      const p = leyo(patrimonio, 'el patrimonio')
      return p === null ? null : p.size
    })(),
    // Un nombramiento de jefe de flota por aceptar también abre «Herramientas»: se acepta dentro de /flota.
    flota: accesosFlotaLeidos === null || nombramientosLeidos === null ? null : accesosFlotaLeidos.size + nombramientosLeidos.length,
    puedeConceder: v === null ? null : v.some((x) => puedeAutorizar(nivelDe(x.nivel))),
    porAceptar,
    patrimonioRecibido,
  }
}

/** El menú de la sesión, o `null` sin sesión. */
export const menuDeSesion = cache(async (): Promise<MenuDeSesion | null> => {
  const identidad = await getIdentidad()
  if (!identidad) return null
  const hechos = await hechosDeMenu(identidad.id)
  return {
    hechos,
    visibles: entradasVisibles(hechos),
    herramientas: herramientasVisibles(hechos),
    contactosEnCuenta: contactosEnCuenta(hechos),
  }
})
