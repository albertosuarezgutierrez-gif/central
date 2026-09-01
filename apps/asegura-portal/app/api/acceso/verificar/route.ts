import { NextResponse } from 'next/server'
import { z } from 'zod'
import { estadoCodigo } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { COOKIE_NAME, COOKIE_OPTS, crearSesion, hashCanal } from '@/lib/auth'

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(200),
  codigo: z.string().length(6),
})

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino, codigo } = parsed.data
  const valorHash = hashCanal(destino)

  const guardado = await prisma.portalCodigo.findFirst({
    where: { tipo, valorHash },
    orderBy: { creadoEn: 'desc' },
  })
  if (!guardado) return NextResponse.json({ error: 'sin_codigo' }, { status: 400 })

  const estado = estadoCodigo(
    { codigo: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    codigo,
    new Date(),
  )

  if (estado !== 'valido') {
    // El intento se cuenta SIEMPRE que el código exista y no esté ya bloqueado:
    // si solo contáramos los aciertos, el tope de intentos no serviría de nada.
    if (estado === 'incorrecto') {
      await prisma.portalCodigo.update({ where: { id: guardado.id }, data: { intentos: { increment: 1 } } })
    }
    return NextResponse.json({ error: estado }, { status: 401 })
  }

  const canalExistente = await prisma.portalCanal.findUnique({ where: { tipo_valorHash: { tipo, valorHash } } })

  const identidadId =
    canalExistente?.identidadId ??
    (
      await prisma.portalIdentidad.create({
        data: { canales: { create: { tipo, valorHash, verificadoEn: new Date() } } },
        select: { id: true },
      })
    ).id

  await prisma.$transaction([
    prisma.portalCodigo.update({ where: { id: guardado.id }, data: { usadoEn: new Date() } }),
    prisma.portalIdentidad.update({ where: { id: identidadId }, data: { ultimoAccesoEn: new Date() } }),
  ])

  const token = await crearSesion(identidadId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
