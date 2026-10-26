import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { verificarPendienteDetalle } from '@/lib/auth'
import { emitirSesionResponsable, DESTINO_RESPONSABLE } from '@/lib/abrir-sesion-responsable'

export async function POST(req: Request) {
  const pending = (await cookies()).get('rrhh_pending')?.value
  if (!pending) return NextResponse.json({ error: 'Sin sesión pendiente' }, { status: 401 })

  let usuario_id: string
  let recordar: boolean
  try { ({ usuario_id, recordar } = await verificarPendienteDetalle(pending)) } catch { return NextResponse.json({ error: 'Sesión caducada' }, { status: 401 }) }

  const { empresa_id } = await req.json().catch(() => ({}))
  if (!empresa_id) return NextResponse.json({ error: 'Falta empresa_id' }, { status: 400 })

  // Verificar que el usuario tiene acceso a esa empresa
  const ok = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT 1 FROM rrhh.usuario_empresas WHERE usuario_id = ${usuario_id}::uuid AND empresa_id = ${empresa_id}::uuid LIMIT 1`)
  if (!ok.length) return NextResponse.json({ error: 'Empresa no autorizada' }, { status: 403 })

  const res = NextResponse.json({ ok: true, irA: DESTINO_RESPONSABLE })
  res.cookies.delete('rrhh_pending')
  await emitirSesionResponsable(res, usuario_id, empresa_id, recordar)
  return res
}
