import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { id: string; confirmado: boolean; compania?: string | null }
  const { id, confirmado } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar que el movimiento pertenece a esta cuenta antes de actualizar
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT mb.id FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Si viene `compania` en el cuerpo (desde el desglose de la correduría), además de confirmar
  // se asigna/limpia el override de compañía. Si no viene, solo se toca destino_confirmado
  // (compatibilidad con /finanzas, que solo confirma).
  if ('compania' in body) {
    const compania = body.compania ? String(body.compania).trim().slice(0, 60) : null
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET destino_confirmado = ${confirmado}, compania_seguros = ${compania} WHERE id = ${id}::uuid
    `
  } else {
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios SET destino_confirmado = ${confirmado} WHERE id = ${id}::uuid
    `
  }

  return NextResponse.json({ ok: true })
}
