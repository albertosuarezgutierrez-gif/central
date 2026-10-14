import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { campanaPresentacionAsegura } from '@/lib/campana-presentacion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/correduria/campana-presentacion — el embudo de la campaña de correo «presentación app».
 * Solo lectura. Reenvía al puerto de asegura con el secreto de operador y devuelve el MISMO status y
 * json; la pantalla lo interpreta con `interpretarCampana`. Sesión de plataforma obligatoria.
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const r = await campanaPresentacionAsegura()
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
