import { NextResponse } from 'next/server'
import { z } from 'zod'
import { tgSend } from '@central/core-telegram'

import { prisma } from '@/lib/db'
import {
  claveCerrado,
  clavePedido,
  claveReservaHuecos,
  MAX_PETICIONES_HUECOS_DIA,
  mensajePeticionHuecos,
  PREFIJO_RESERVA_HUECOS,
  ramosValidos,
} from '@/lib/huecos-proteccion'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/huecos-proteccion — la tarjeta «Seguros que no nos constan» de la bóveda (13/10/2026).
 * Cuerpo: `{ accion: 'cerrar' }` | `{ accion: 'pedir', ramos: [...] }`. Estado en `portal_aviso_leido`
 * (`lib/huecos-proteccion.ts`), sin tabla nueva.
 *
 *   · `cerrar` → la oculta 90 días.
 *   · `pedir`  → avisa a Alberto por Telegram (como `/api/polizas/[id]/gestion`: nunca escribe a terceros).
 *                Los ramos son solo texto del aviso y se validan contra la lista; no abren nada.
 *                Idempotente por día; reserva ANTES de enviar; tope diario por identidad contado en BD.
 *                Solo se sella «pedido» si el aviso salió de verdad.
 *
 * 🚨 Identidad de la COOKIE. Vista de corredor: solo lectura.
 */
const Entrada = z.object({ accion: z.enum(['cerrar', 'pedir']), ramos: z.array(z.string()).max(6).optional() })

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const tope = rateLimit(`huecos-proteccion:${getIp(req)}`, 20, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ estado: 'demasiadas' }, { status: 429 })

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'invalido' }, { status: 400 })

  const ahora = new Date()
  if (parsed.data.accion === 'cerrar') {
    await prisma.portalAvisoLeido.createMany({ data: [{ identidadId: identidad.id, clave: claveCerrado(ahora) }], skipDuplicates: true })
    return NextResponse.json({ estado: 'cerrada' })
  }

  const ramos = ramosValidos(parsed.data.ramos)
  if (ramos.length === 0) return NextResponse.json({ estado: 'invalido' }, { status: 400 })

  const yaHoy = await prisma.portalAvisoLeido.count({ where: { identidadId: identidad.id, clave: clavePedido(ahora) } })
  if (yaHoy > 0) return NextResponse.json({ estado: 'ya_pedido' })

  const reservasHoy = await prisma.portalAvisoLeido.count({
    where: {
      identidadId: identidad.id,
      clave: { startsWith: PREFIJO_RESERVA_HUECOS },
      creadoEn: { gte: new Date(ahora.getTime() - 24 * 60 * 60 * 1000) },
    },
  })
  if (reservasHoy >= MAX_PETICIONES_HUECOS_DIA) return NextResponse.json({ estado: 'demasiadas' }, { status: 429 })
  const reserva = await prisma.portalAvisoLeido.createMany({
    data: [{ identidadId: identidad.id, clave: claveReservaHuecos(ahora) }],
    skipDuplicates: true,
  })
  if (reserva.count === 0) return NextResponse.json({ estado: 'en_curso' }, { status: 409 })

  const vinculada = (await prisma.portalVinculo.count({ where: { identidadId: identidad.id } })) > 0
  let idMensaje: number | null = null
  try {
    idMensaje = await tgSend(mensajePeticionHuecos({ identidadId: identidad.id, nombre: vinculada ? identidad.nombre : null, ramos }))
  } catch (e) {
    console.error('[portal/huecos] Telegram no aceptó el mensaje:', e instanceof Error ? e.message : e)
    return NextResponse.json({ estado: 'error' }, { status: 502 })
  }
  if (idMensaje === null) {
    console.warn('[portal/huecos] sin avisar: falta TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID en este proyecto')
    return NextResponse.json({ estado: 'sin_canal' }, { status: 503 })
  }
  await prisma.portalAvisoLeido.createMany({ data: [{ identidadId: identidad.id, clave: clavePedido(ahora) }], skipDuplicates: true })
  return NextResponse.json({ estado: 'pedida' })
}
