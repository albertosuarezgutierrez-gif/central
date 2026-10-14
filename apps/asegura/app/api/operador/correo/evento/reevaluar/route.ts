import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { reevaluarEmisionesSinResolver } from '@/lib/correo-evento-bd'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/operador/correo/evento/reevaluar — sin cuerpo (14/10/2026). El cron de triaje de plataforma lo
 * llama al final de cada pasada: las emisiones `sin_resolver` («póliza nueva aún no llegada por CIMA») de los
 * últimos 60 días se vuelven a resolver y, si CIMA ya trae la póliza en vigor, pasan a `duplicado_cima`.
 * → { estado:'ok', revisadas, resueltas }. Idempotente. NUNCA crea pólizas, notas ni tareas.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const { revisadas, resueltas } = await reevaluarEmisionesSinResolver(correduria.id)
    return NextResponse.json({ estado: 'ok', revisadas, resueltas })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/correo/evento/reevaluar', e) }, { status: 500 })
  }
})
