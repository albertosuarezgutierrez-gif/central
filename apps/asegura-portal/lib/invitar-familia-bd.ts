// «Invita a tu familia» contra la BD. Las reglas viven en `lib/invitar-familia.ts` (puro, con test).
//
// 🔒 Todo va por la IDENTIDAD de la cookie. El token se guarda HASHEADO (`hashCanal`, misma pimienta que el
// canal) y en claro solo existe en el valor de retorno de `crearEnlaceFamilia`, que la ruta convierte en el
// enlace a compartir: es el producto (a diferencia del correo de `lib/invitaciones.ts`, donde el token NO se
// devuelve a quien invita). Aun así NO abre sesión ni datos: solo presenta el portal; quién eres lo dice el
// código al correo.
import { randomBytes } from 'node:crypto'

import { BYTES_TOKEN_INVITACION, normalizarTokenInvitacion } from '@central/module-seguros-portal'
import { tgSend } from '@central/core-telegram'

import { hashCanal } from './auth'
import { prisma } from './db'
import { getIdentidad } from './session'
import {
  MAX_ENLACES_DIA,
  MAX_USOS_ENLACE,
  VENTANA_CUPO_ENLACE_MS,
  caducidadEnlace,
  decidirUso,
  enlaceFamilia,
  estadoEnlace,
  mensajeAvisoFamilia,
  resumenFamilia,
  type ResumenFamilia,
} from './invitar-familia'

export type ResultadoCrearEnlace =
  | { ok: true; enlace: string }
  | { ok: false; error: 'sin_enlace' | 'limite_diario' | 'sin_vinculo'; mensaje: string }

async function crearEnlaceFamilia(identidadId: string): Promise<ResultadoCrearEnlace> {
  const token = randomBytes(BYTES_TOKEN_INVITACION).toString('hex')
  const enlace = enlaceFamilia(token)
  // Sin dominio no se escribe nada (mismo criterio que `sin_enlace` de las invitaciones por correo).
  if (enlace === null) {
    return { ok: false, error: 'sin_enlace', mensaje: 'Ahora mismo no podemos crear enlaces. No hemos guardado nada.' }
  }
  const hoy = new Date()
  const hoyCreados = await prisma.portalInvitacionEnlace.count({
    where: { creadaPorIdentidadId: identidadId, creadaEn: { gte: new Date(hoy.getTime() - VENTANA_CUPO_ENLACE_MS) } },
  })
  if (hoyCreados >= MAX_ENLACES_DIA) {
    return { ok: false, error: 'limite_diario', mensaje: 'Has creado ya varios enlaces hoy. Prueba de nuevo mañana.' }
  }
  const vinculo = await prisma.portalVinculo.findFirst({
    where: { identidadId },
    select: { correduriaId: true },
    orderBy: { creadoEn: 'asc' },
  })
  if (vinculo === null) {
    return { ok: false, error: 'sin_vinculo', mensaje: 'Todavía no tienes seguros vinculados desde los que invitar.' }
  }
  await prisma.portalInvitacionEnlace.create({
    data: {
      correduriaId: vinculo.correduriaId,
      creadaPorIdentidadId: identidadId,
      tokenHash: hashCanal(token),
      creadaEn: hoy,
      caducaEn: caducidadEnlace(hoy),
      maxUsos: MAX_USOS_ENLACE,
    },
    select: { id: true },
  })
  return { ok: true, enlace }
}

/**
 * Para la página pública (sin sesión): `{ viva }` y NADA más. Token inexistente, caducado, revocado o agotado
 * contestan igual (no es un oráculo de tokens).
 */
export async function enlaceFamiliaViva(tokenCrudo: unknown): Promise<boolean> {
  const token = normalizarTokenInvitacion(tokenCrudo)
  if (token === null) return false
  const fila = await prisma.portalInvitacionEnlace.findUnique({
    where: { tokenHash: hashCanal(token) },
    select: { caducaEn: true, revocadaEn: true, maxUsos: true, _count: { select: { usos: true } } },
  })
  if (fila === null) return false
  return estadoEnlace({ caducaEn: fila.caducaEn, revocadaEn: fila.revocadaEn, max: fila.maxUsos, usos: fila._count.usos }, new Date()) === 'viva'
}

export type ResultadoUso = 'registrado' | 'no_aplica'

/**
 * Anota que esta identidad entró por el enlace y avisa al corredor. Idempotente: el índice único por
 * identidad impide el segundo registro y, con él, el segundo aviso. Respuesta única `no_aplica` para todo lo
 * que no cuenta (enlace muerto, propio, cuenta ya existente): quien llama no aprende nada del enlace.
 */
async function registrarEntradaFamilia(tokenCrudo: unknown, identidadId: string): Promise<ResultadoUso> {
  const token = normalizarTokenInvitacion(tokenCrudo)
  if (token === null) return 'no_aplica'
  const [fila, identidad] = await Promise.all([
    prisma.portalInvitacionEnlace.findUnique({
      where: { tokenHash: hashCanal(token) },
      select: { id: true, creadaPorIdentidadId: true, caducaEn: true, revocadaEn: true, maxUsos: true, _count: { select: { usos: true } } },
    }),
    prisma.portalIdentidad.findUnique({ where: { id: identidadId }, select: { creadaEn: true } }),
  ])
  if (fila === null || identidad === null) return 'no_aplica'
  const ahora = new Date()
  const decision = decidirUso({
    estado: estadoEnlace({ caducaEn: fila.caducaEn, revocadaEn: fila.revocadaEn, max: fila.maxUsos, usos: fila._count.usos }, ahora),
    creadorId: fila.creadaPorIdentidadId,
    identidadId,
    identidadCreadaEn: identidad.creadaEn,
    ahora,
  })
  if (decision !== 'registrar') return 'no_aplica'
  try {
    await prisma.portalInvitacionEnlaceUso.create({ data: { enlaceId: fila.id, identidadId, usadoEn: ahora }, select: { id: true } })
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002') return 'no_aplica'
    throw e
  }
  // Best-effort: un Telegram caído no deshace la anotación. Sin datos personales del invitado.
  try {
    await tgSend(mensajeAvisoFamilia())
  } catch (e) {
    console.error('[portal/invitar-familia] aviso Telegram fallido:', e instanceof Error ? e.message : e)
  }
  return 'registrado'
}

/** Contadores de la pantalla de Contactos. Solo cifras, nunca a quién. Sin try/catch: un fallo no es «0». */
async function resumenFamiliaDeIdentidad(identidadId: string): Promise<ResumenFamilia> {
  const [enlaces, usosEnlaces, correosPresento, correosPresentoAceptados] = await Promise.all([
    prisma.portalInvitacionEnlace.count({ where: { creadaPorIdentidadId: identidadId } }),
    prisma.portalInvitacionEnlaceUso.count({ where: { enlace: { creadaPorIdentidadId: identidadId } } }),
    prisma.portalInvitacion.count({ where: { otorgadaPorIdentidadId: identidadId, alcance: 'ninguno' } }),
    prisma.portalInvitacion.count({ where: { otorgadaPorIdentidadId: identidadId, alcance: 'ninguno', aceptadaEn: { not: null } } }),
  ])
  return resumenFamilia({ enlaces, usosEnlaces, correosPresento, correosPresentoAceptados })
}

// ── Puertas públicas: la identidad sale SIEMPRE de la cookie (`lib/session`), nunca de quien llama ──
// (`test/regression-portal-aislamiento.test.ts`). `null` = sin sesión.

export async function crearEnlaceFamiliaDeSesion(): Promise<ResultadoCrearEnlace | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return crearEnlaceFamilia(identidad.id)
}

export async function registrarEntradaFamiliaDeSesion(tokenCrudo: unknown): Promise<ResultadoUso | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return registrarEntradaFamilia(tokenCrudo, identidad.id)
}

export async function resumenFamiliaDeSesion(): Promise<ResumenFamilia | null> {
  const identidad = await getIdentidad()
  if (!identidad) return null
  return resumenFamiliaDeIdentidad(identidad.id)
}
