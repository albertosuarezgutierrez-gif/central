import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { disponible, iniciarAuth } from '@/lib/enablebanking'

export const dynamic = 'force-dynamic'

// POST /api/banca/psd2/conectar { sociedadId, institutionId, institutionNombre } —
// crea el consentimiento PSD2 y devuelve el link al que redirigir al dueño (su banco).
// institutionId = nombre del ASPSP en Enable Banking.
export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!disponible()) return NextResponse.json({ error: 'Enable Banking sin configurar (ENABLEBANKING_APP_ID/PRIVATE_KEY)' }, { status: 503 })

  const body = await req.json().catch(() => null) as { sociedadId?: string; institutionId?: string; institutionNombre?: string } | null
  if (!body?.sociedadId || !body.institutionId) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const soc = await prisma.sociedad.findFirst({ where: { id: body.sociedadId, cuentaId: session.id } })
  if (!soc) return NextResponse.json({ error: 'Sociedad no encontrada' }, { status: 404 })

  const origin = req.nextUrl.origin
  try {
    const auth = await iniciarAuth(body.institutionId, 'ES', `${origin}/api/banca/psd2/callback`, randomUUID())
    await prisma.$executeRaw`
      INSERT INTO conexiones_banco (cuenta_id, sociedad_id, proveedor, institution_id, institution_nombre, requisition_id, estado)
      VALUES (${session.id}::uuid, ${body.sociedadId}::uuid, 'enablebanking', ${body.institutionId}, ${body.institutionNombre ?? body.institutionId}, ${auth.authorization_id}, 'pendiente')
    `
    return NextResponse.json({ ok: true, link: auth.url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error al crear el consentimiento' }, { status: 502 })
  }
}
