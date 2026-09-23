import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { interpretarTareasHoy, tareasHoyAsegura } from '@/lib/seguimiento-asegura'

export const dynamic = 'force-dynamic'

/** GET — tareas de seguimiento que vencen hoy o ya vencieron (puerto de asegura). */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await tareasHoyAsegura()
  return NextResponse.json(interpretarTareasHoy(r.status, r.json))
}
