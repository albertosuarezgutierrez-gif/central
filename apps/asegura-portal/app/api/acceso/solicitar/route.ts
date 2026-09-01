import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generarCodigo } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { hashCanal } from '@/lib/auth'
import { obtenerCanal, registrarCanal, type TipoCanal } from '@/lib/canal'
import { canalEmail } from '@/lib/canal-email'
import { canalConsola } from '@/lib/canal-consola'

registrarCanal(process.env.NODE_ENV === 'production' ? canalEmail : canalConsola)

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(200),
})

export async function POST(req: Request) {
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
