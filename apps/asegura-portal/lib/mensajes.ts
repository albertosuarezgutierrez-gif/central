/**
 * Mensajes con tu corredor (ASegura OS §Q.7): lo que el cliente escribe y lee en el portal.
 *
 * 🚨 La ficha sale SIEMPRE de `portal_vinculo` de la sesión (`getIdentidad`), nunca de la petición:
 * con un rol sin RLS, un `clienteId` de fuera no falla, escribe en la ficha de otro. La póliza del
 * tema la vigila además la FK compuesta (cliente_id, poliza_id) de la BD.
 *
 * El corredor contesta desde /correduria (plataforma → puerto de asegura); aquí solo se lee su
 * respuesta. Telegram avisa a Alberto de cada mensaje, pero NO es el registro: el registro es la tabla.
 */
import { tgSend } from '@central/core-telegram'
import {
  decidirFichaPropia,
  escaparHtml,
  MAX_MENSAJES_DIA,
  normalizarCuerpo,
  type Mensaje,
} from '@central/module-seguros-portal'

import { prisma } from './db'
import { getIdentidad } from './session'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LecturaMensajes =
  | { estado: 'ok'; mensajes: Mensaje[]; puedeEscribir: boolean; noPuede: 'modo_corredor' | 'varias_fichas' | null }
  | { estado: 'sin_ficha' }
  | { estado: 'sin_sesion' }

/** Los mensajes de sus fichas, y si puede escribir (una sola ficha propia y no es la vista del corredor). */
export async function mensajesDeSesion(): Promise<LecturaMensajes> {
  const identidad = await getIdentidad()
  if (!identidad) return { estado: 'sin_sesion' }
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId: identidad.id },
    select: { clienteId: true, correduriaId: true, origen: true },
  })
  if (vinculos.length === 0) return { estado: 'sin_ficha' }
  const filas = await prisma.portalMensaje.findMany({
    where: { OR: vinculos.map((v) => ({ clienteId: v.clienteId, correduriaId: v.correduriaId })) },
    orderBy: { creadoAt: 'desc' },
    take: 300,
  })
  const propias = vinculos.filter((v) => v.origen !== 'corredor').map((v) => v.clienteId)
  // El motivo viaja: «estás viendo el portal como el cliente» y «tu correo está en dos fichas» son
  // dos cosas distintas, y pintar una en lugar de la otra afirma algo falso.
  const noPuede = identidad.corredor !== null ? 'modo_corredor' : decidirFichaPropia(propias).estado === 'ok' ? null : 'varias_fichas'
  return {
    estado: 'ok',
    puedeEscribir: noPuede === null,
    noPuede,
    mensajes: filas.map((f) => ({
      id: f.id,
      autor: f.autor === 'corredor' ? 'corredor' : 'cliente',
      cuerpo: f.cuerpo,
      polizaId: f.polizaId,
      creadoAt: f.creadoAt.toISOString(),
      leidoAt: f.leidoAt ? f.leidoAt.toISOString() : null,
    })),
  }
}

/**
 * Sella como leídas las respuestas del corredor QUE SE HAN ENSEÑADO (`ids`), no todo lo que haya sin
 * leer: una respuesta que llegue mientras se pinta la página no la ha visto nadie. La vista del
 * corredor NO sella: si lo hiciera, su propia bandeja diría que el cliente ya leyó lo que abrió Alberto.
 */
export async function marcarLeidosDeSesion(ids: string[]): Promise<void> {
  const identidad = await getIdentidad()
  if (!identidad || identidad.corredor !== null || ids.length === 0) return
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId: identidad.id },
    select: { clienteId: true, correduriaId: true },
  })
  if (vinculos.length === 0) return
  await prisma.portalMensaje.updateMany({
    where: {
      id: { in: ids },
      OR: vinculos.map((v) => ({ clienteId: v.clienteId, correduriaId: v.correduriaId })),
      autor: 'corredor',
      leidoAt: null,
    },
    data: { leidoAt: new Date() },
  })
}

export type ResultadoEnvio =
  | { estado: 'enviado'; id: string; avisado: boolean }
  | { estado: 'invalido' }
  | { estado: 'poliza_no_valida' }
  | { estado: 'limite_diario' }
  | { estado: 'sin_ficha' }
  | { estado: 'varias_fichas' }
  | { estado: 'sin_sesion' }
  | { estado: 'modo_corredor' }

export async function enviarMensajeDeSesion(polizaIdCrudo: unknown, cuerpoCrudo: unknown): Promise<ResultadoEnvio> {
  const identidad = await getIdentidad()
  if (!identidad) return { estado: 'sin_sesion' }
  if (identidad.corredor !== null) return { estado: 'modo_corredor' }
  const cuerpo = normalizarCuerpo(cuerpoCrudo)
  const polizaId = polizaIdCrudo === null || polizaIdCrudo === undefined || polizaIdCrudo === '' ? null : polizaIdCrudo
  if (cuerpo === null || (polizaId !== null && (typeof polizaId !== 'string' || !UUID.test(polizaId)))) {
    return { estado: 'invalido' }
  }

  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId: identidad.id, origen: { not: 'corredor' } },
    select: { clienteId: true, correduriaId: true },
  })
  const ficha = decidirFichaPropia(vinculos.map((v) => v.clienteId))
  if (ficha.estado === 'sin_ficha') return { estado: 'sin_ficha' }
  if (ficha.estado === 'varias_fichas') return { estado: 'varias_fichas' }
  const vinculo = vinculos.find((v) => v.clienteId === ficha.clienteId)!

  const desde = new Date(Date.now() - 24 * 3_600_000)
  const hoy = await prisma.portalMensaje.count({ where: { identidadId: identidad.id, creadoAt: { gte: desde } } })
  if (hoy >= MAX_MENSAJES_DIA) return { estado: 'limite_diario' }

  let id: string
  try {
    const fila = await prisma.portalMensaje.create({
      data: {
        correduriaId: vinculo.correduriaId,
        clienteId: ficha.clienteId,
        polizaId: polizaId as string | null,
        autor: 'cliente',
        identidadId: identidad.id,
        cuerpo,
      },
      select: { id: true },
    })
    id = fila.id
  } catch (e) {
    // P2003 = la FK compuesta: la póliza no es de su ficha (o no existe).
    if ((e as { code?: string })?.code === 'P2003') return { estado: 'poliza_no_valida' }
    throw e
  }

  // Aviso a Alberto: best-effort. El mensaje ya está guardado y lo verá en /correduria igual.
  let avisado = false
  try {
    const recorte = cuerpo.length > 600 ? `${cuerpo.slice(0, 600)}…` : cuerpo
    const quien = identidad.nombre?.trim() ? escaparHtml(identidad.nombre.trim()) : 'Un cliente'
    avisado = (await tgSend(`💬 <b>Mensaje en el portal</b> · ${quien}\n\n${escaparHtml(recorte)}\n\nContéstalo en /correduria → Hoy.`)) !== null
  } catch (e) {
    console.error('[mensajes] no se pudo avisar por Telegram:', e instanceof Error ? e.message : e)
  }
  return { estado: 'enviado', id, avisado }
}
