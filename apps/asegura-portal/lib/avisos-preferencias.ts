import { TIPOS_AVISO_CIMA, type TipoAvisoCima } from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

export type PreferenciasAvisos = Record<TipoAvisoCima, boolean>

/** Qué avisos de CIMA tiene encendidos la identidad de la cookie. Sin fila = encendido. */
export async function preferenciasDeSesion(): Promise<PreferenciasAvisos | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  const apagados = await prisma.portalAvisoSilenciado.findMany({ where: { identidadId: identidad.id }, select: { tipo: true } })
  const off = new Set(apagados.map((a) => a.tipo))
  return Object.fromEntries(TIPOS_AVISO_CIMA.map((t) => [t, !off.has(t)])) as PreferenciasAvisos
}

export async function cambiarPreferenciaDeSesion(tipo: TipoAvisoCima, activo: boolean): Promise<boolean> {
  const identidad = await getIdentidad()
  if (!identidad) return false
  // Siempre acotado por `identidadId` de la cookie: la frontera entre una bóveda y otra.
  if (activo) {
    await prisma.portalAvisoSilenciado.deleteMany({ where: { identidadId: identidad.id, tipo } })
  } else {
    await prisma.portalAvisoSilenciado.createMany({ data: [{ identidadId: identidad.id, tipo }], skipDuplicates: true })
  }
  return true
}
