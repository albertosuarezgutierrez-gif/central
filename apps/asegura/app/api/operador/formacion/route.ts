import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { borrarCurso, formacionDelAño, registrarCurso } from '@/lib/formacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Formación continua IDD (horas por persona y año).
 *
 *   GET    ?año=YYYY → { estado:'ok', cursos, resumen:{año,minimo,personas,pendientes} }
 *   POST   { persona, curso, entidad?, fecha, horas, documentoId?, actor } → 201 creado · 422 invalida
 *   DELETE ?id= → { estado:'hecho' } · 404 no_encontrado · 422 invalida
 */
async function correduria(): Promise<{ r: NextResponse } | { id: string }> {
  if (!aseguraConfigurada()) return { r: NextResponse.json({ estado: 'sin_configurar' }) }
  const c = await correduriaUnica()
  if (!c) return { r: NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 }) }
  return { id: c.id }
}

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  // El año de Madrid, no el de UTC: el 1 de enero a las 00:30 ya es el año nuevo para quien pregunta.
  const añoHoy = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))
  const año = Number(new URL(req.url).searchParams.get('año') ?? añoHoy)
  if (!Number.isInteger(año) || año < 2000 || año > añoHoy) {
    return NextResponse.json({ estado: 'invalida', motivo: 'Año no válido.' }, { status: 422 })
  }
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    return NextResponse.json(await formacionDelAño(c.id, año))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/formacion', e) }, { status: 500 })
  }
}

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const actor = typeof cuerpo?.actor === 'string' && cuerpo.actor.trim() ? cuerpo.actor.trim() : 'corredor'
    const r = await registrarCurso(c.id, cuerpo, actor)
    return NextResponse.json(r, { status: r.estado === 'creado' ? 201 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/formacion', e) }, { status: 500 })
  }
})

export const DELETE = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const c = await correduria()
    if ('r' in c) return c.r
    const r = await borrarCurso(c.id, new URL(req.url).searchParams.get('id') ?? '')
    return NextResponse.json({ estado: r }, { status: r === 'hecho' ? 200 : r === 'no_encontrado' ? 404 : 422 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/formacion', e) }, { status: 500 })
  }
})
