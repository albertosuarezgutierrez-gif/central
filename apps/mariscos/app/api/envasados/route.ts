import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { validarEnvasado, importe, type Canal } from '@central/module-pesca'

const optDate = (v: unknown) => (v === '' || v == null ? null : new Date(String(v)))

const Body = z.object({
  partidaId: z.string().uuid(),
  canal: z.enum(['mostrador', 'catering', 'hotel']),
  pesoKg: z.coerce.number(),
  precioKg: z.coerce.number(),
  fechaCaducidad: z.string().optional().nullable(),
  cliente: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  // La partida debe existir y ser de esta cuenta.
  const partida = await prisma.mariscosPartida.findFirst({
    where: { id: b.partidaId, cuentaId: s.id },
    include: { envasados: { select: { pesoKg: true } } },
  })
  if (!partida) return NextResponse.json({ error: 'Partida no encontrada' }, { status: 404 })

  const yaEnvasados = partida.envasados.map((e) => ({ pesoKg: Number(e.pesoKg) }))
  const errores = validarEnvasado(
    { pesoRecibidoKg: Number(partida.pesoRecibidoKg) },
    yaEnvasados,
    { pesoKg: b.pesoKg, precioKg: b.precioKg },
  )
  if (errores.length) return NextResponse.json({ errores }, { status: 400 })

  // Código del envase: lote de origen + secuencia (deja el lote a la vista y es único por partida).
  const seq = partida.envasados.length + 1
  const codigo = `${partida.loteOrigen}·${String(seq).padStart(3, '0')}`

  const row = await prisma.mariscosEnvasado.create({
    data: {
      cuentaId: s.id,
      partidaId: partida.id,
      canal: b.canal as Canal,
      pesoKg: b.pesoKg,
      precioKg: b.precioKg,
      importe: importe(b.pesoKg, b.precioKg),
      fechaCaducidad: optDate(b.fechaCaducidad),
      cliente: b.cliente || null,
      codigo,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: row.id })
}
