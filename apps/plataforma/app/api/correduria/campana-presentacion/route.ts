import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { campanaDeParametro, campanaPresentacionAsegura } from '@/lib/campana-presentacion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/correduria/campana-presentacion — el embudo de una campaña de correo (`?campana=`,
 * `presentacion_app` por defecto o `aviso_venc_app`).
 * Solo lectura. Reenvía al puerto de asegura con el secreto de operador y devuelve el MISMO status y
 * json; la pantalla lo interpreta con `interpretarCampana`. Sesión de plataforma obligatoria.
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const campana = campanaDeParametro(new URL(req.url).searchParams.get('campana'))
  if (!campana) return NextResponse.json({ estado: 'error', motivo: 'campana_desconocida' }, { status: 400 })
  const r = await campanaPresentacionAsegura(campana)
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
