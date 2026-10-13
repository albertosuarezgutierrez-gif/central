import {
  TIPOS_AVISO_CIMA,
  VERSION_TEXTO_AVISOS,
  consentimientoVigente,
  horaDeMinutos,
  resolverPreferenciasAvisos,
  type CanalAviso,
  type DiasAntelacion,
  type PreferenciasAvisosGuardadas,
  type TipoAvisoCima,
  type UmbralSubidaPrima,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'
import type { VistaPospuesta } from './push-estado'

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

// ─── «Configuración → Avisos» (13/10/2026) ───────────────────────────────────

export interface ConfiguracionAvisos {
  /** Lo efectivo (con los valores por defecto puestos): lo que de verdad hacen los crons. */
  canal: CanalAviso
  diasAntelacion: DiasAntelacion
  noMolestar: { desde: string; hasta: string } | null
  /** % de subida del precio a partir del que se avisa (`subida_prima`, fase B). Sin configurar = 10. */
  umbralSubidaPrima: UmbralSubidaPrima
  /** `true` si la persona lo ha tocado alguna vez (si no, lo de arriba son los valores de siempre). */
  configurado: boolean
  bienvenida: { pospuestaEn: string | null; pospuestaVista: VistaPospuesta | null }
  /** Última fila `avisos` sobre el texto vigente; `null` = nunca se le preguntó. */
  consentimientoAvisos: boolean | null
  corredor: boolean
}

const SELECT_PREFS = {
  canal: true,
  diasAntelacion: true,
  noMolestarDesde: true,
  noMolestarHasta: true,
  umbralSubidaPrima: true,
  bienvenidaPospuestaEn: true,
  bienvenidaPospuestaVista: true,
} as const

export async function configuracionAvisosDeSesion(): Promise<ConfiguracionAvisos | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  const [fila, consentimientos] = await Promise.all([
    prisma.portalPreferenciasAvisos.findUnique({ where: { identidadId: identidad.id }, select: SELECT_PREFS }),
    prisma.portalConsentimiento.findMany({
      where: { identidadId: identidad.id, tipo: 'avisos' },
      select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
    }),
  ])
  const p = resolverPreferenciasAvisos(fila)
  const vista = fila?.bienvenidaPospuestaVista
  return {
    canal: p.canal,
    diasAntelacion: p.diasAntelacion,
    noMolestar: p.noMolestar ? { desde: horaDeMinutos(p.noMolestar.desde), hasta: horaDeMinutos(p.noMolestar.hasta) } : null,
    umbralSubidaPrima: p.umbralSubidaPrima,
    configurado: fila !== null && (fila.canal !== null || fila.diasAntelacion !== null || fila.noMolestarDesde !== null),
    bienvenida: {
      pospuestaEn: fila?.bienvenidaPospuestaEn?.toISOString() ?? null,
      pospuestaVista: vista === 'inactivas' || vista === 'instalar_ios' ? vista : null,
    },
    consentimientoAvisos: consentimientoVigente(consentimientos, 'avisos', VERSION_TEXTO_AVISOS),
    corredor: identidad.corredor != null,
  }
}

/** Guarda lo ya validado por `validarCambioPreferencias`. Solo la fila de la identidad de la cookie. */
export async function guardarConfiguracionAvisosDeSesion(datos: Partial<PreferenciasAvisosGuardadas>): Promise<boolean> {
  const identidad = await getIdentidad()
  if (!identidad) return false
  await prisma.portalPreferenciasAvisos.upsert({
    where: { identidadId: identidad.id },
    create: { identidadId: identidad.id, ...datos },
    update: datos,
  })
  return true
}

/** «Ahora no» en la bienvenida: se guarda en la BD (no en el navegador) para que valga en todos. */
export async function posponerBienvenidaDeSesion(vista: VistaPospuesta): Promise<boolean> {
  const identidad = await getIdentidad()
  if (!identidad) return false
  const datos = { bienvenidaPospuestaEn: new Date(), bienvenidaPospuestaVista: vista }
  await prisma.portalPreferenciasAvisos.upsert({
    where: { identidadId: identidad.id },
    create: { identidadId: identidad.id, ...datos },
    update: datos,
  })
  return true
}

// ─── «Configuración → Privacidad» ────────────────────────────────────────────

export interface ConsentimientoListado {
  tipo: string
  otorgado: boolean
  versionTexto: string
  creadoEn: Date
}

/** Todas las filas de `portal_consentimiento` de la identidad de la cookie, de la más nueva a la más vieja. */
export async function consentimientosDeSesion(): Promise<ConsentimientoListado[] | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return prisma.portalConsentimiento.findMany({
    where: { identidadId: identidad.id },
    select: { tipo: true, otorgado: true, versionTexto: true, creadoEn: true },
    orderBy: { creadoEn: 'desc' },
    take: 100,
  })
}
