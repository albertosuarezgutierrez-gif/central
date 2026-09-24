import { NextResponse } from 'next/server'
import { z } from 'zod'

import { MAX_SUGERENCIA } from '@central/module-seguros-portal'

import { prisma } from '@/lib/db'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'
import { enviarSugerencia } from '@/lib/sugerencia'

export const runtime = 'nodejs'

/**
 * POST /api/sugerencia — «dinos qué echas de menos». Le llega a Alberto por
 * Telegram y, si esa persona tiene ficha, queda en su historial.
 *
 * 🚨 La identidad sale de la COOKIE, como en todo el portal: quien sugiere es
 * quien tiene la sesión.
 *
 * Hay tope por IP porque detrás de esto está el Telegram de una persona y, sin
 * él, cualquiera con sesión puede llenárselo. ⚠️ El tope es EN MEMORIA, o sea
 * por instancia en Vercel (lo dice `lib/rate-limit.ts`): corta el ruido, no es
 * un límite global. Se acepta AQUÍ porque exige sesión y el destino es un chat
 * nuestro — **no se copie este razonamiento a una ruta pública ni a una que
 * escriba a terceros**, que es lo que obligó a poner un segundo tope en
 * `/api/acceso/solicitar`.
 */
const Entrada = z.object({
  // Tope de FORMA (que no llegue un cuerpo enorme). El recorte de verdad lo
  // hace `normalizarSugerencia` en el módulo puro.
  texto: z.string().max(MAX_SUGERENCIA * 4),
  /** En qué pantalla estaba. Ayuda a entender la sugerencia; no es un dato suyo. */
  desde: z.string().max(60).optional(),
})

const POR_HORA = 5
const UNA_HORA = 60 * 60 * 1000

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'error' }, { status: 401 })
  }

  const tope = rateLimit(`sugerencia:${getIp(req)}`, POR_HORA, UNA_HORA)
  if (!tope.allowed) {
    return NextResponse.json(
      { estado: 'demasiadas' },
      { status: 429, headers: tope.retryAfter ? { 'retry-after': String(tope.retryAfter) } : undefined },
    )
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ estado: 'vacia' }, { status: 400 })

  // ¿Tiene ficha en la cartera? Decide si el mensaje puede decir su nombre: sin
  // vínculo, el nombre es lo que tecleó al entrar y no lo ha comprobado nadie.
  // La consulta filtra por SU identidad, como todas las de esta app.
  const vinculada = (await prisma.portalVinculo.count({ where: { identidadId: identidad.id } })) > 0

  const r = await enviarSugerencia(
    { identidadId: identidad.id, nombre: identidad.nombre, vinculada, desde: parsed.data.desde ?? null },
    parsed.data.texto,
  )

  // 🚨 Solo `enviada` sale con 200. Aquí Telegram es el ÚNICO registro para
  // quien no tiene ficha, así que un fallo no puede llevar cara de éxito.
  const status = r === 'enviada' ? 200 : r === 'vacia' ? 400 : r === 'sin_canal' ? 503 : 502
  return NextResponse.json({ estado: r }, { status })
}
