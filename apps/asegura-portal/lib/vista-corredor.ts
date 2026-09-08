// La «vista de corredor»: Alberto abre el portal COMO lo ve un cliente
// (08/09/2026). El enlace lo crea asegura; aquí se consume UNA vez y se monta
// la sesión. Reglas y constantes en `@central/module-seguros-portal/vista-corredor`.
//
// 🚨 Cómo se consigue «ver lo mismo» sin tocar ninguna lectura: la identidad
// dedicada al corredor (`IDENTIDAD_CORREDOR_ID`) recibe un vínculo TEMPORAL con
// la ficha (`origen = 'corredor'`), y las diez lecturas del portal, que
// filtran por identidad, hacen el resto. Solo hay un vínculo de corredor a la
// vez: abrir una ficha suelta la anterior. Y asegura excluye ese origen al
// decir «ya entra al portal», que es lo único que este atajo podría romper.
import {
  IDENTIDAD_CORREDOR_ID,
  ORIGEN_VINCULO_CORREDOR,
  estadoEnlaceVista,
  formatoTokenVistaValido,
  hashTokenVista,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

export type AperturaVista =
  | { estado: 'ok'; clienteId: string }
  | { estado: 'enlace_invalido' | 'usado' | 'caducado' | 'sin_identidad_corredor' }

export async function abrirVistaCorredor(tokenCrudo: unknown): Promise<AperturaVista> {
  if (!formatoTokenVistaValido(tokenCrudo)) return { estado: 'enlace_invalido' }
  const fila = await prisma.portalVistaCorredor.findUnique({
    where: { tokenHash: await hashTokenVista(tokenCrudo) },
    select: { id: true, correduriaId: true, clienteId: true, creadoEn: true, usadoEn: true },
  })
  if (!fila) return { estado: 'enlace_invalido' }
  const estado = estadoEnlaceVista(fila, new Date())
  if (estado !== 'valido') return { estado }

  // La identidad la siembra la migración. Si no está, no se inventa: sin ella
  // el vínculo no tiene a quién colgar y la bóveda saldría vacía sin error.
  const corredor = await prisma.portalIdentidad.findUnique({ where: { id: IDENTIDAD_CORREDOR_ID }, select: { id: true } })
  if (!corredor) return { estado: 'sin_identidad_corredor' }

  await prisma.$transaction([
    prisma.portalVistaCorredor.update({ where: { id: fila.id }, data: { usadoEn: new Date() } }),
    // Un solo vínculo de corredor a la vez: el de la ficha que se abre ahora.
    prisma.portalVinculo.deleteMany({
      where: { identidadId: IDENTIDAD_CORREDOR_ID, origen: ORIGEN_VINCULO_CORREDOR, clienteId: { not: fila.clienteId } },
    }),
    prisma.portalVinculo.upsert({
      where: { identidadId_clienteId: { identidadId: IDENTIDAD_CORREDOR_ID, clienteId: fila.clienteId } },
      create: {
        identidadId: IDENTIDAD_CORREDOR_ID,
        correduriaId: fila.correduriaId,
        clienteId: fila.clienteId,
        nivel: 'gestionar',
        origen: ORIGEN_VINCULO_CORREDOR,
      },
      update: {},
    }),
  ])
  return { estado: 'ok', clienteId: fila.clienteId }
}

/**
 * Al salir: si la sesión es la del corredor, se suelta su vínculo temporal.
 * La ficha sale de la SESIÓN, no de un parámetro: nadie puede pedir por HTTP
 * que se suelte el vínculo de otra. Best-effort — la cookie se borra igual.
 */
export async function cerrarVistaCorredorDeSesion(): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad?.corredor) return
  try {
    await prisma.portalVinculo.deleteMany({
      where: { identidadId: IDENTIDAD_CORREDOR_ID, clienteId: identidad.corredor.clienteId, origen: ORIGEN_VINCULO_CORREDOR },
    })
  } catch (e) {
    console.error('[portal/vista-corredor] no se pudo soltar el vínculo:', e instanceof Error ? e.message : e)
  }
}

/**
 * Para la banda «Estás viendo el portal de …»: el nombre de la ficha que la
 * sesión del corredor tiene abierta. `null` = sesión normal (no hay banda) o
 * no se pudo leer. Igual que arriba, el id sale de la sesión.
 */
export async function nombreDeFichaEnVista(): Promise<string | null> {
  const identidad = await getIdentidad()
  if (!identidad?.corredor) return null
  try {
    const c = await prisma.cliente.findUnique({
      where: { id: identidad.corredor.clienteId },
      select: { nombre: true, apellidos: true },
    })
    if (!c) return 'este cliente'
    const n = [c.nombre, c.apellidos].filter((s) => typeof s === 'string' && s.trim() !== '').join(' ').trim()
    return n === '' ? 'este cliente' : n
  } catch {
    return 'este cliente'
  }
}
