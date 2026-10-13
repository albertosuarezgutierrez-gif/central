import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tgSend } from '@central/core-telegram'

import { prisma } from '@/lib/db'
import { DECLARADA_NO_ELIMINADA } from '@/lib/declaradas-eliminadas'
import {
  claveAhoraNo,
  clavePedida,
  claveReserva,
  MAX_PETICIONES_DIA,
  PREFIJO_RESERVA,
  estadoCaptacion,
  mensajePeticionGestion,
  notaPeticionGestion,
  PREFIJO_CAPTACION,
  type DatosPeticionGestion,
} from '@/lib/captacion-declarada'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'
import { anotarEnFicha } from '@/lib/sugerencia'

export const runtime = 'nodejs'

/**
 * POST /api/polizas/[id]/gestion — la tarjeta «¿Quieres verla siempre al día?» de una póliza que
 * APORTÓ el cliente (13/10/2026). Cuerpo: `{ accion: 'pedir' | 'ahora_no' }`.
 *
 *   · `pedir`   → avisa a Alberto por Telegram (y deja nota en la ficha si la hay), igual que las
 *                 sugerencias. NUNCA escribe a la persona ni a terceros. Idempotente: si ya hay
 *                 petición para esa póliza responde `ya_pedida` y no avisa otra vez.
 *   · `ahora_no`→ la oculta 90 días (`lib/captacion-declarada.ts`).
 *
 * 🚨 Identidad de la COOKIE; la póliza se busca con `identidadId` DENTRO del `where` (solo las
 * propias y no eliminadas; la de un titular que dio acceso es 404, no 403). Solo se marca
 * «pedida» si el aviso salió: un `sin_canal`/`error` no puede acabar en «ya lo hemos recibido».
 */
const Entrada = z.object({ accion: z.enum(['pedir', 'ahora_no']) })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  // Vista de corredor: solo lectura. Alberto no pide por el cliente.
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const tope = rateLimit(`captacion-declarada:${getIp(req)}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ estado: 'demasiadas' }, { status: 429 })

  const { id } = await params
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'invalido' }, { status: 400 })
  if (!UUID.test(id)) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })

  const p = await prisma.portalPolizaDeclarada.findFirst({
    where: { id, identidadId: identidad.id, ...DECLARADA_NO_ELIMINADA },
    select: { id: true, compania: true, ramo: true, numeroPoliza: true, fechaVencimiento: true },
  })
  if (!p) return NextResponse.json({ estado: 'no_encontrada' }, { status: 404 })

  const ahora = new Date()
  const marcas = await prisma.portalAvisoLeido.findMany({
    where: { identidadId: identidad.id, clave: { startsWith: PREFIJO_CAPTACION } },
    select: { clave: true, creadoEn: true },
  })

  if (parsed.data.accion === 'ahora_no') {
    await prisma.portalAvisoLeido.createMany({
      data: [{ identidadId: identidad.id, clave: claveAhoraNo(p.id, ahora) }],
      skipDuplicates: true,
    })
    return NextResponse.json({ estado: 'oculta' })
  }

  // Idempotencia: ya pedida (o se hubiera ocultado: pedir sigue valiendo, no duplica).
  if (estadoCaptacion({ propia: true, eliminada: false, polizaId: p.id, marcas, ahora }) === 'ya_pedida') {
    return NextResponse.json({ estado: 'ya_pedida' })
  }

  // Con ficha comprobada, el nombre es fiable; sin vínculo, es lo que tecleó al entrar.
  const vinculada = (await prisma.portalVinculo.count({ where: { identidadId: identidad.id } })) > 0
  const datos: DatosPeticionGestion = {
    identidadId: identidad.id,
    nombre: vinculada ? identidad.nombre : null,
    polizaId: p.id,
    compania: p.compania,
    ramo: p.ramo,
    numeroPoliza: p.numeroPoliza,
    fechaVencimiento: p.fechaVencimiento ? p.fechaVencimiento.toISOString().slice(0, 10) : null,
  }

  // Tope por identidad contado en BD (el de IP en memoria no es el límite real) y reserva idempotente
  // ANTES de enviar: dos POST simultáneos chocan en la clave y solo uno llega a Telegram. El rol no tiene
  // DELETE: si el envío falla la reserva se queda y el reintento se libera al cambiar la ventana de la clave.
  const hoy = await prisma.portalAvisoLeido.count({
    where: { identidadId: identidad.id, clave: { startsWith: PREFIJO_RESERVA }, creadoEn: { gte: new Date(ahora.getTime() - 24 * 60 * 60 * 1000) } },
  })
  if (hoy >= MAX_PETICIONES_DIA) return NextResponse.json({ estado: 'demasiadas' }, { status: 429 })
  const reserva = await prisma.portalAvisoLeido.createMany({
    data: [{ identidadId: identidad.id, clave: claveReserva(p.id, ahora) }],
    skipDuplicates: true,
  })
  if (reserva.count === 0) return NextResponse.json({ estado: 'en_curso' }, { status: 409 })

  let idMensaje: number | null = null
  try {
    idMensaje = await tgSend(mensajePeticionGestion(datos))
  } catch (e) {
    console.error('[portal/gestion] Telegram no aceptó el mensaje:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 502 })
  }
  if (idMensaje === null) {
    console.warn('[portal/gestion] sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
    return NextResponse.json({ estado: 'sin_canal' }, { status: 503 })
  }

  await prisma.portalAvisoLeido.createMany({
    data: [{ identidadId: identidad.id, clave: clavePedida(p.id) }],
    skipDuplicates: true,
  })
  // Constancia en la ficha (best-effort; un lead sin ficha queda solo en Telegram). Se espera para que la
  // función serverless no se congele a medias, pero un fallo NO cambia la respuesta: el Telegram ya salió.
  try {
    await anotarEnFicha(identidad.id, notaPeticionGestion(datos))
  } catch (e) {
    console.error('[portal/gestion] no se pudo anotar en la ficha:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ estado: 'pedida' })
}
