import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { duplicadosAsegura } from '@/lib/duplicados-asegura'

export const dynamic = 'force-dynamic'

/**
 * /api/correduria/duplicados — pólizas vivas repetidas (mismo número y
 * compañía) en la cartera de la correduría. Es el guardián de la conciliación
 * Codeoscopic↔CIMA (docs/CORREDURIA-CRM-VISION.md §5).
 * Esta app no toca la BD de la correduría: reenvía al puerto de asegura
 * (`/api/operador/duplicados`) con el secreto de operador y devuelve el MISMO
 * status y json, para que la pantalla lea el contrato del puerto tal cual
 * (ok / sin_configurar / error). Sesión de plataforma obligatoria: es la
 * pantalla de Alberto.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await duplicadosAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
