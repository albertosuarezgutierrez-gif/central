import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getSesion } from '@/lib/tenant'
import { emitirSesionResponsable } from '@/lib/abrir-sesion-responsable'

export async function POST(req: Request) {
  let s
  try { s = await getSesion() } catch { return NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }

  const { empresa_id } = await req.json().catch(() => ({}))
  if (!empresa_id) return NextResponse.json({ error: 'Falta empresa_id' }, { status: 400 })

  const ok = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM rrhh.usuario_empresas
    WHERE usuario_id = ${s.usuario_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!ok.length) return NextResponse.json({ error: 'Empresa no autorizada' }, { status: 403 })

  // Conserva «Recordar este dispositivo» y recuerda la empresa elegida para la próxima entrada.
  const res = NextResponse.json({ ok: true })
  await emitirSesionResponsable(res, s.usuario_id, empresa_id, s.recordar === true)
  return res
}
