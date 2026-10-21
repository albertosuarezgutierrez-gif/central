import {
  TIPOS_AVISO_INTERRUPTOR,
  TIPO_AVISO_VENCIMIENTO_CARNET,
  TIPO_AVISO_VENCIMIENTO_ITV,
  VERSION_TEXTO_AVISOS,
  consentimientoVigente,
  horaDeMinutos,
  resolverPreferenciasAvisos,
  type CanalAviso,
  type DiasAntelacion,
  type PreferenciasAvisosGuardadas,
  type TipoAvisoInterruptor,
  type UmbralSubidaPrima,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'
import type { VistaPospuesta } from './push-estado'

export type PreferenciasAvisos = Record<TipoAvisoInterruptor, boolean>

/** Qué avisos tiene encendidos la identidad de la cookie (los de CIMA y el del carné). Sin fila = encendido. */
export async function preferenciasDeSesion(): Promise<PreferenciasAvisos | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  const apagados = await prisma.portalAvisoSilenciado.findMany({ where: { identidadId: identidad.id }, select: { tipo: true } })
  const off = new Set(apagados.map((a) => a.tipo))
  return Object.fromEntries(TIPOS_AVISO_INTERRUPTOR.map((t) => [t, !off.has(t)])) as PreferenciasAvisos
}

export async function cambiarPreferenciaDeSesion(tipo: TipoAvisoInterruptor, activo: boolean): Promise<boolean> {
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

/**
 * ¿Apagó esta identidad «avisarme de la caducidad de mi carné»? (la pasa la campana). Sin fila = encendido
 * (`false`). Si la lectura falla, LANZA: la campana lo trata como encendido (repetir un aviso es mejor que
 * esconderlo) y lo registra. Acotada por `identidadId`.
 */
export async function avisoCarnetSilenciado(identidadId: string): Promise<boolean> {
  const fila = await prisma.portalAvisoSilenciado.findUnique({
    where: { identidadId_tipo: { identidadId, tipo: TIPO_AVISO_VENCIMIENTO_CARNET } },
    select: { tipo: true },
  })
  return fila !== null
}

/** ¿Apagó esta identidad «avisarme de la ITV de mi vehículo»? Mismo contrato que `avisoCarnetSilenciado`. */
export async function avisoItvSilenciado(identidadId: string): Promise<boolean> {
  const fila = await prisma.portalAvisoSilenciado.findUnique({
    where: { identidadId_tipo: { identidadId, tipo: TIPO_AVISO_VENCIMIENTO_ITV } },
    select: { tipo: true },
  })
  return fila !== null
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

/**
 * La antelación guardada de ESTA identidad (la de la cookie, la pasa la campana), tal cual: `null` = sin
 * fila o sin configurar. La campana la pasa por `diasVentanaVencimiento()` (nunca menos de 7). Si la
 * lectura falla, LANZA: quien llama decide (la campana se queda con los 7 de siempre y lo registra).
 */
export async function diasAntelacionDeIdentidad(identidadId: string): Promise<number | null> {
  const fila = await prisma.portalPreferenciasAvisos.findUnique({ where: { identidadId }, select: { diasAntelacion: true } })
  return fila?.diasAntelacion ?? null
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
