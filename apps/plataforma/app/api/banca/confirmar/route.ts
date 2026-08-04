import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { claveReferencia } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json() as { id: string; confirmado: boolean; compania?: string | null }
  const { id, confirmado } = body
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar que el movimiento pertenece a esta cuenta antes de actualizar (y traer su concepto
  // para poder aprender la regla por código de referencia).
  const rows = await prisma.$queryRaw<Array<{ id: string; concepto: string | null }>>`
    SELECT mb.id, mb.concepto FROM movimientos_bancarios mb
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
      UPDATE movimientos_bancarios
      SET destino_confirmado = ${confirmado},
          compania_seguros = ${compania},
          requiere_revision = CASE WHEN ${confirmado} THEN false ELSE requiere_revision END
      WHERE id = ${id}::uuid
    `

    // APRENDIZAJE: si se asignó una compañía y el concepto trae un código de referencia,
    // guardamos la regla (clave → compañía) y la aplicamos a TODOS los movimientos de seguros de
    // esta cuenta con el mismo código (pasados y futuros se clasifican solos por esa regla).
    const clave = compania ? claveReferencia(rows[0].concepto) : null
    if (compania && clave) {
      await prisma.$executeRaw`
        INSERT INTO correduria_reglas (cuenta_id, clave, compania)
        VALUES (${session.id}::uuid, ${clave}, ${compania})
        ON CONFLICT (cuenta_id, clave) DO UPDATE SET compania = EXCLUDED.compania
      `
      await prisma.$executeRaw`
        UPDATE movimientos_bancarios mb
        SET compania_seguros = ${compania}, destino_confirmado = true, requiere_revision = false
        FROM cuentas_bancarias cb
        WHERE cb.id = mb.cuenta_bancaria_id
          AND cb.cuenta_id = ${session.id}::uuid
          AND mb.destino = 'seguros'
          AND mb.concepto ILIKE ${'%' + clave + '%'}
      `
    }
  } else {
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios
      SET destino_confirmado = ${confirmado},
          requiere_revision = CASE WHEN ${confirmado} THEN false ELSE requiere_revision END
      WHERE id = ${id}::uuid
    `
  }

  return NextResponse.json({ ok: true })
}
