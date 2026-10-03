import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { duplicadosVistos, guardarDuplicadosVistos } from '@/lib/cartera-duplicados-vistos'
import { validarVistos } from '@/lib/duplicados-vistos'

export const dynamic = 'force-dynamic'

// Duplicados vivos ya avisados (evento `duplicados_vivos_visto`), para el aviso diario de grupos NUEVOS.
//   GET  → { estado:'ok', claves: string[] | null }  (null = nunca guardado) · { estado:'error' }
//   POST { claves: string[] } → { estado:'ok'} · 422 · 500. Claves `numero|dgs`: sin nombres ni PII.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json(await duplicadosVistos(correduria.id))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/duplicados/vistos', e) })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const v = validarVistos(await req.json().catch(() => null))
    if (!v.ok) return NextResponse.json({ estado: 'invalido', motivo: 'claves (lista de «numero|dgs») obligatorias' }, { status: 422 })
    const ok = await guardarDuplicadosVistos(correduria.id, v.claves)
    return ok ? NextResponse.json({ estado: 'ok' }) : NextResponse.json({ estado: 'error', motivo: 'no se pudo guardar' }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/duplicados/vistos', e) }, { status: 500 })
  }
})
