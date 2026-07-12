import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { claveReglaValida } from '@/lib/correduria'
import { DESTINO_LABEL } from '@/lib/destino'

export const dynamic = 'force-dynamic'

// GET /api/banca/reglas — lista las reglas aprendidas (clave → negocio) de la cuenta, con un flag
// `sospechosa` para las claves genéricas/trampa (las que hoy ya NO se aplican). Solo lectura, scoped.
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const rows = await prisma.$queryRaw<Array<{ clave: string; destino: string; subcategoria: string | null; creado_at: Date }>>`
    SELECT clave, destino, subcategoria, creado_at
    FROM banca_destino_reglas
    WHERE cuenta_id = ${session.id}::uuid
    ORDER BY creado_at DESC
  `
  const reglas = rows.map(r => ({
    clave: r.clave,
    destino: r.destino,
    destinoLabel: DESTINO_LABEL[r.destino as keyof typeof DESTINO_LABEL] || r.destino,
    subcategoria: r.subcategoria,
    creadoAt: r.creado_at ? r.creado_at.toISOString().slice(0, 10) : null,
    sospechosa: !claveReglaValida(r.clave),
  }))
  return NextResponse.json({ reglas })
}

// DELETE /api/banca/reglas { clave } — borra una regla aprendida (no toca los movimientos ya
// clasificados; solo deja de auto-aplicarse a los futuros/reanalizados). Scoped por cuenta_id.
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { clave } = await req.json().catch(() => ({})) as { clave?: string }
  if (!clave) return NextResponse.json({ error: 'clave requerida' }, { status: 400 })

  const n = await prisma.$executeRaw`
    DELETE FROM banca_destino_reglas WHERE cuenta_id = ${session.id}::uuid AND clave = ${clave}
  `
  return NextResponse.json({ ok: true, borradas: Number(n) })
}
