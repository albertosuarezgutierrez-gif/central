import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getAdapter } from '@/lib/adapters'

// GET /api/comunicacion/directorio?app=<ialimp|sivra|iarest>&refExt=<id>
// Devuelve las personas/roles del negocio para dirigir comunicación (F0.3).
// Verifica que el negocio pertenece a una sociedad de la cuenta (dueño) en sesión.
export async function GET(req: NextRequest) {
  const s = await requireSession().catch(() => null)
  if (!s) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const app = searchParams.get('app') || ''
  const refExt = searchParams.get('refExt') || ''
  if (!app || !refExt) return NextResponse.json({ error: 'app y refExt requeridos' }, { status: 400 })

  // El negocio (app, refExt) debe colgar de una sociedad de esta cuenta.
  const negocio = await prisma.negocio.findFirst({ where: { app, refExt } })
  if (!negocio) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
  const soc = await prisma.sociedad.findFirst({ where: { id: negocio.sociedadId, cuentaId: s.id } })
  if (!soc) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const adapter = getAdapter(app)
  if (!adapter?.listarDirectorio) return NextResponse.json({ personas: [] })
  const personas = await adapter.listarDirectorio(refExt)
  return NextResponse.json({ personas })
}
