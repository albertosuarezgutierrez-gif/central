import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import type { Destino } from '@/lib/destino'
import { claveReferencia } from '@/lib/correduria'

export const dynamic = 'force-dynamic'

const DESTINOS: Destino[] = ['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal']

// POST /api/banca/destino { id, destino } — reclasifica el "destino"/negocio de un movimiento.
// Lo usa el desglose de la correduría para SACAR de seguros un movimiento que no lo era.
// Scoped por cuenta_id (verifica pertenencia antes de actualizar).
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, destino } = await req.json().catch(() => ({})) as { id?: string; destino?: string }
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  if (!destino || !DESTINOS.includes(destino as Destino)) {
    return NextResponse.json({ error: 'destino inválido' }, { status: 400 })
  }

  const rows = await prisma.$queryRaw<Array<{ id: string; concepto: string | null }>>`
    SELECT mb.id, mb.concepto FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE mb.id = ${id}::uuid AND cb.cuenta_id = ${session.id}::uuid
    LIMIT 1
  `
  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Al moverlo fuera de seguros lo damos por confirmado (decisión manual del dueño).
  await prisma.$executeRaw`
    UPDATE movimientos_bancarios SET destino = ${destino}, destino_confirmado = true, compania_seguros = NULL WHERE id = ${id}::uuid
  `

  // APRENDIZAJE: si el concepto trae un código de referencia (DNI de la pensión, código de
  // proveedor…), guardamos la regla (clave → destino) y la aplicamos a TODOS los movimientos de
  // la cuenta que sigan en 'seguros' con ese mismo código (pasados); los futuros se clasifican
  // solos al ingestar (lib/categorizar.ts consulta estas reglas).
  const clave = claveReferencia(rows[0].concepto)
  if (clave) {
    await prisma.$executeRaw`
      INSERT INTO banca_destino_reglas (cuenta_id, clave, destino)
      VALUES (${session.id}::uuid, ${clave}, ${destino})
      ON CONFLICT (cuenta_id, clave) DO UPDATE SET destino = EXCLUDED.destino
    `
    await prisma.$executeRaw`
      UPDATE movimientos_bancarios mb
      SET destino = ${destino}, destino_confirmado = true, compania_seguros = NULL
      FROM cuentas_bancarias cb
      WHERE cb.id = mb.cuenta_bancaria_id
        AND cb.cuenta_id = ${session.id}::uuid
        AND mb.destino = 'seguros'
        AND mb.concepto ILIKE ${'%' + clave + '%'}
    `
  }

  return NextResponse.json({ ok: true })
}
