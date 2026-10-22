/**
 * «Herramientas» del portal (Fase 0, 22/10/2026): lectura y petición de módulos sobre
 * `seguros.portal_modulo` (`prisma/sql/2026-10-22_portal_modulos.sql`). Las reglas (catálogo, qué
 * botón, el texto del aviso) son puras: `packages/module-seguros-portal/src/modulos.ts`.
 *
 * 🔒 La identidad NO la pasa quien llama: cada función la resuelve de la COOKIE (`lib/session`) y va
 * DENTRO del `where` y del `data` del INSERT. El módulo que llega del navegador se valida contra el
 * catálogo cerrado y se vuelve a calcular su acción aquí: el botón no decide, la ruta sí.
 *
 * Tres estados: si una lectura falla, la tarjeta queda «sin comprobar» (`null`), nunca «no tienes».
 */
import { Prisma } from '@prisma/client'
import { tgSend } from '@central/core-telegram'
import {
  VERSION_CONDICIONES_MODULOS,
  accionModulo,
  admiteSolicitud,
  mensajeSolicitudModulo,
  tarjetasModulos,
  type FilaModulo,
  type ModuloPortal,
  type TarjetaModulo,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { empresasDeFlota } from './flota'
import { getIdentidad } from './session'

type Contexto = { accesoFlota: boolean | null; filas: FilaModulo[] | null }

async function contextoDe(identidadId: string): Promise<Contexto> {
  const [flota, filas] = await Promise.allSettled([
    empresasDeFlota(identidadId),
    prisma.portalModulo.findMany({
      where: { identidadId },
      select: { modulo: true, estado: true, solicitadoEn: true },
    }),
  ])
  if (flota.status === 'rejected') console.error('[portal/modulos] no se pudo comprobar la flota:', motivo(flota.reason))
  if (filas.status === 'rejected') console.error('[portal/modulos] no se pudo leer portal_modulo:', motivo(filas.reason))
  return {
    accesoFlota: flota.status === 'fulfilled' ? flota.value.length > 0 : null,
    filas: filas.status === 'fulfilled' ? filas.value : null,
  }
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Las tarjetas de ESTA sesión, o `null` sin sesión. */
export async function tarjetasDeSesion(): Promise<TarjetaModulo[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return tarjetasModulos(await contextoDe(identidad.id))
}

export type ResultadoSolicitud =
  | { estado: 'registrada'; aviso: 'enviado' | 'sin_canal' | 'error' }
  | { estado: 'sin_sesion' | 'no_admite' | 'ya_solicitado' | 'sin_comprobar' }

/**
 * Deja la fila `solicitado` y avisa a Alberto por Telegram. La FILA es el registro: un fallo del
 * aviso no deshace la petición (se devuelve en `aviso` para que el log y la ruta lo distingan).
 */
export async function solicitarModuloDeSesion(modulo: ModuloPortal): Promise<ResultadoSolicitud> {
  const identidad = await getIdentidad()
  if (!identidad) return { estado: 'sin_sesion' }

  const accion = accionModulo(modulo, await contextoDe(identidad.id))
  if (accion.tipo === 'sin_comprobar') return { estado: 'sin_comprobar' }
  if (accion.tipo === 'solicitado') return { estado: 'ya_solicitado' }
  if (!admiteSolicitud(accion)) return { estado: 'no_admite' }

  try {
    await prisma.portalModulo.create({
      // Solo las tres columnas con GRANT INSERT: `estado`/`origen` los pone la BD (`solicitado`/`portal`).
      data: { identidadId: identidad.id, modulo, versionCondiciones: VERSION_CONDICIONES_MODULOS },
      select: { id: true },
    })
  } catch (e) {
    // El índice único parcial decide la carrera entre dos pulsaciones.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { estado: 'ya_solicitado' }
    throw e
  }

  return { estado: 'registrada', aviso: await avisar(identidad.id, identidad.nombre, modulo) }
}

async function avisar(identidadId: string, nombre: string | null, modulo: ModuloPortal): Promise<'enviado' | 'sin_canal' | 'error'> {
  try {
    // ¿Tiene ficha? Decide si el nombre está comprobado (sin vínculo es lo que tecleó al entrar).
    const vinculada = (await prisma.portalVinculo.count({ where: { identidadId } })) > 0
    const id = await tgSend(mensajeSolicitudModulo({ identidadId, nombre, vinculada, modulo }))
    if (id === null) {
      console.warn('[portal/modulos] solicitud sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
      return 'sin_canal'
    }
    return 'enviado'
  } catch (e) {
    console.error('[portal/modulos] no se ha podido avisar de la solicitud:', motivo(e))
    return 'error'
  }
}
