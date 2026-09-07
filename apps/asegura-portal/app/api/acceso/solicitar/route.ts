import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generarCodigo } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { hashCanal } from '@/lib/auth'
import { obtenerCanal, registrarCanal, type TipoCanal } from '@/lib/canal'
import { canalEmail } from '@/lib/canal-email'
import { canalConsola } from '@/lib/canal-consola'
import { getIp, rateLimit } from '@/lib/rate-limit'

registrarCanal(process.env.NODE_ENV === 'production' ? canalEmail : canalConsola)

// El mismo E.164 que exige `companias_dgs_whatsapp_e164` (canal-compania.ts):
// un `destino` de whatsapp que no case con esto no puede recibir nada.
const E164 = /^\+[1-9][0-9]{7,14}$/

// La FORMA solo, igual que en `app/api/peticiones/route.ts`: aceptar
// `z.string().min(3)` sin más dejaba mandar el código a cualquier cadena de
// ≥3 caracteres — un amplificador de correo con el dominio de la correduría.
const Entrada = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('email'), destino: z.string().trim().email().max(200) }),
  z.object({ tipo: z.literal('whatsapp'), destino: z.string().trim().regex(E164) }),
])

export async function POST(req: Request) {
  // Best-effort por IP, ANTES de tocar la BD: sin sesión que dé un cupo por
  // identidad (es la puerta de entrada), el freno solo puede ser la IP.
  const limite = rateLimit(getIp(req), 5, 15 * 60 * 1000)
  if (!limite.allowed) {
    return NextResponse.json({ error: 'limite_intentos' }, { status: 429 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino } = parsed.data
  const canal = obtenerCanal(tipo as TipoCanal)

  // «Este canal no está montado» NO es «no hemos podido enviarlo». Decirle al
  // usuario que falló el envío cuando WhatsApp aún no existe es mentirle.
  if (!canal) return NextResponse.json({ error: 'canal_no_disponible', tipo }, { status: 503 })

  const codigo = generarCodigo()
  await prisma.portalCodigo.create({
    data: { tipo, valorHash: hashCanal(destino), codigo },
  })

  const enviado = await canal.enviarCodigo(destino, codigo)
  if (!enviado) return NextResponse.json({ error: 'envio_fallido' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
