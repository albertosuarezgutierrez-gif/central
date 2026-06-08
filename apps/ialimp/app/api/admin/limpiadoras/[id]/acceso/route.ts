import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireEmpresaId } from '@/lib/tenant'
import { genHex } from '@/lib/propietario-auth'

// POST /api/admin/limpiadoras/[id]/acceso
// Devuelve (y crea si no existe) el "enlace mágico" de acceso de la limpiadora.
// El cliente arma la URL final: `${window.location.origin}/l/acceso/${token}`.
// Body opcional: { regenerate: true } → rota el token (invalida el enlace anterior).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const empresa_id = await requireEmpresaId()
    const { id } = await params
    const { regenerate } = await req.json().catch(() => ({}))

    // Token nuevo generado en Node (pgcrypto no disponible en esta BD).
    // Si regenerate → siempre lo pisamos; si no → COALESCE conserva el existente.
    const nuevo = genHex(24)
    const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE limpiadoras SET
        acceso_token = ${regenerate ? nuevo : Prisma.sql`COALESCE(acceso_token, ${nuevo})`}
      WHERE id = ${id}::uuid AND empresa_id = ${empresa_id}::uuid
      RETURNING acceso_token
    `)
    if (!filas.length) return NextResponse.json({ error: 'Limpiadora no encontrada' }, { status: 404 })

    // Al rotar el enlace, invalidar también las sesiones abiertas de esa limpiadora.
    if (regenerate) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM limpiadora_sessions WHERE limpiadora_id = ${id}::uuid`)
    }

    return NextResponse.json({ ok: true, token: filas[0].acceso_token })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
