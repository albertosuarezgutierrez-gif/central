import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { lineasTrasEmision } from '@/lib/correduria-emision-tg'
import { avisarEmision } from '@/lib/emision-aviso-asegura'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** POST { polizaId, prueba } — correo del nuevo seguro al cliente (o a ti, de prueba) y baja de la anterior. */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof b?.polizaId === 'string' ? b.polizaId : ''
  if (!UUID.test(polizaId)) return NextResponse.json({ estado: 'error', motivo: 'póliza no válida' }, { status: 422 })
  const r = await avisarEmision(polizaId, b?.prueba === true)
  if (r.estado !== 'ok') return NextResponse.json(r, { status: 502 })
  // El texto es el MISMO que el de Telegram tras emitir: una sola forma de contar qué pasó.
  const texto = lineasTrasEmision(r.tras).trim()
  return NextResponse.json({ ...r, texto: r.prueba ? `🧪 PRUEBA: el correo ha ido a tu buzón, no al cliente.\n${texto}` : texto })
}
