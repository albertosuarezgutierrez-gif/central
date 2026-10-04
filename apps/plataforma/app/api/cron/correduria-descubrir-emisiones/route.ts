// ────────────────────────────────────────────────────────────────────────────
// Descubrimiento AUTOMÁTICO de emisiones de Avant2 (03/10/2026). Cada 30 min de 07 a 23 h pide a
// asegura que mire en Avant2 los proyectos con solicitud presentada (gratis) y registre lo que pueda
// demostrar por documento. Aquí: latido + Telegram SOLO si hay algo nuevo o si se rompe (sin PII).
//
// 🚨 Un fallo de lectura NUNCA es «0 emisiones»: el latido va en rojo. La decisión es PURA y está
// probada en `lib/correduria/descubrir-emisiones-aviso.ts`.
// ────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { tgAviso } from '@/lib/telegram'
import { isCronAuthorized } from '@/lib/cron-auth'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { descubrirEmisionesAsegura } from '@/lib/correduria-puerto'
import {
  AGENTE_DESCUBRIR,
  decidirDescubrimiento,
  interpretarDescubrimiento,
  type Descubrimiento,
  type LatidoPrevio,
} from '@/lib/correduria/descubrir-emisiones-aviso'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** El latido ANTERIOR (antes de escribir el de esta pasada). `null` = no se pudo leer. */
async function latidoPrevio(): Promise<LatidoPrevio> {
  try {
    const [f] = await prisma.$queryRaw<{ ok: boolean | null; detalle: string | null; ultimo_at: Date | null; ultimo_ok_at: Date | null }[]>(Prisma.sql`
      SELECT ok, detalle, ultimo_at, ultimo_ok_at FROM agente_latidos WHERE agente = ${AGENTE_DESCUBRIR}`)
    if (!f) return { ok: null, detalle: null, ultimoAt: null, ultimoOkAt: null }
    return { ok: f.ok, detalle: f.detalle, ultimoAt: f.ultimo_at, ultimoOkAt: f.ultimo_ok_at }
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const previo = await latidoPrevio()
  let r: Descubrimiento
  try {
    const resp = await descubrirEmisionesAsegura()
    r = resp === null ? { estado: 'sin_configurar' } : interpretarDescubrimiento(resp.status, resp.json)
  } catch {
    r = { estado: 'error', motivo: 'red' }
  }

  const d = decidirDescubrimiento({ r, previo, ahora: new Date() })
  let enviado = false
  if (d.mensaje) {
    try {
      await tgAviso('correduria.emisiones-descubiertas', d.mensaje)
      enviado = true
    } catch (e) {
      // «Telegram falló» va DELANTE: así la próxima pasada no da el aviso de credenciales por ya enviado.
      await registrarLatido(AGENTE_DESCUBRIR, false, `Telegram falló (${String(e).slice(0, 120)}); ${d.latidoDetalle}`)
      return NextResponse.json({ ok: false, estado: r.estado, motivo: 'telegram' }, { status: 200 })
    }
  }
  await registrarLatido(AGENTE_DESCUBRIR, d.latidoOk, d.latidoDetalle)
  return NextResponse.json({ ok: d.latidoOk, estado: r.estado, detalle: d.latidoDetalle, enviado })
}
