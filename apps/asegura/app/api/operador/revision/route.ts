import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { casosAbiertos, resolverCaso } from '@/lib/cartera-revision'
import { validarResolver } from '@/lib/revision-manual'

export const dynamic = 'force-dynamic'

// Bandeja de revisión manual de pólizas (03/10/2026). Los casos viven en `seguros.operational_events`
// (`poliza_revision_manual` abre, `poliza_revision_resuelta` cierra). Sin PII.
//   GET  → casos abiertos con datos mínimos de cada póliza.
//   POST { casoId, decision: 'misma'|'distintas'|'descartar', nota? } → registra la decisión.
//        «misma» NO fusiona: la fusión la aplica una sesión con el método CTE y el OK de Alberto.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const casos = await casosAbiertos(correduria.id)
    if (casos === null) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', casos })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/revision', e) })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const v = validarResolver(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: v.motivo }, { status: 422 })
    const r = await resolverCaso(correduria.id, v.datos)
    if (!r.ok) return NextResponse.json({ estado: r.estado }, { status: r.status })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/revision', e) }, { status: 500 })
  }
})
