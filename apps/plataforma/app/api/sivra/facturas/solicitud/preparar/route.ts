import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { exigirSesionFacturas } from '@/lib/sivra/facturas/acceso'
import { proponerSiCompleta } from '@/lib/sivra/facturas/chat'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/sivra/facturas/solicitud/preparar { solicitudId }
// Solicitud `pendiente` ya rellena y válida, sin borrador → mismo camino que el agente (`proponerSiCompleta`: reclamo
// atómico pendiente → completada + borrador + Telegram con ✅ Enviar / ✏️ Modificar). NUNCA emite ni envía.
export async function POST(req: NextRequest) {
  const g = await exigirSesionFacturas()
  if (!g.ok) return g.respuesta
  const b = await req.json().catch(() => null) as { solicitudId?: unknown } | null
  const id = typeof b?.solicitudId === 'string' ? b.solicitudId.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Solicitud no válida' }, { status: 400 })
  const sol = await prisma.sivraFacturaSolicitud.findFirst({ where: { id, cuentaId: g.cuentaId }, select: { id: true } })
  if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  const r = await proponerSiCompleta(sol.id)
  if (r === 'ya') return NextResponse.json({ error: 'La solicitud ya no está pendiente (otro camino la ha atendido)' }, { status: 409 })
  if (r === 'incompleta') return NextResponse.json({ error: 'Los datos de la solicitud no son válidos' }, { status: 422 })
  if (!r.ok) return NextResponse.json({ error: r.motivo, codigo: r.codigo }, { status: 422 })
  return NextResponse.json({ ok: true, facturaId: r.facturaId, propuesta: r.propuesta })
}
