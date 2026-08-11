import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { validarPartida } from '@central/module-pesca'

const opt = (v: unknown) => (v === '' || v == null ? null : v)
const optNum = (v: unknown) => (v === '' || v == null ? null : Number(v))
const optDate = (v: unknown) => (v === '' || v == null ? null : new Date(String(v)))

const Body = z.object({
  producto: z.string().min(1),
  nombreCientifico: z.string().optional().nullable(),
  proveedor: z.string().optional().nullable(),
  loteOrigen: z.string().min(1),
  albaran: z.string().optional().nullable(),
  marea: z.string().optional().nullable(),
  barco: z.string().optional().nullable(),
  zonaCaptura: z.string().optional().nullable(),
  artePesca: z.string().optional().nullable(),
  metodoProduccion: z.string().optional().nullable(),
  fechaCaptura: z.string().optional().nullable(),
  fechaRecepcion: z.string().optional().nullable(),
  fechaCaducidad: z.string().optional().nullable(),
  calibre: z.string().optional().nullable(),
  pesoRecibidoKg: z.coerce.number(),
  precioCompraKg: z.union([z.coerce.number(), z.literal('')]).optional().nullable(),
  precioVentaKg: z.union([z.coerce.number(), z.literal('')]).optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const b = parsed.data

  // Validación de dominio (lógica pura del módulo).
  const errores = validarPartida({
    producto: b.producto,
    loteOrigen: b.loteOrigen,
    pesoRecibidoKg: b.pesoRecibidoKg,
    precioCompraKg: optNum(b.precioCompraKg),
    precioVentaKg: optNum(b.precioVentaKg),
    fechaRecepcion: b.fechaRecepcion || '',
  })
  if (errores.length) return NextResponse.json({ errores }, { status: 400 })

  const row = await prisma.mariscosPartida.create({
    data: {
      cuentaId: s.id,
      producto: b.producto,
      nombreCientifico: opt(b.nombreCientifico) as string | null,
      proveedor: opt(b.proveedor) as string | null,
      loteOrigen: b.loteOrigen,
      albaran: opt(b.albaran) as string | null,
      marea: opt(b.marea) as string | null,
      barco: opt(b.barco) as string | null,
      zonaCaptura: opt(b.zonaCaptura) as string | null,
      artePesca: opt(b.artePesca) as string | null,
      metodoProduccion: opt(b.metodoProduccion) as string | null,
      fechaCaptura: optDate(b.fechaCaptura),
      fechaRecepcion: optDate(b.fechaRecepcion) ?? new Date(),
      fechaCaducidad: optDate(b.fechaCaducidad),
      calibre: opt(b.calibre) as string | null,
      pesoRecibidoKg: b.pesoRecibidoKg,
      precioCompraKg: optNum(b.precioCompraKg),
      precioVentaKg: optNum(b.precioVentaKg),
      notas: opt(b.notas) as string | null,
    },
    select: { id: true },
  })

  return NextResponse.json({ ok: true, id: row.id })
}
