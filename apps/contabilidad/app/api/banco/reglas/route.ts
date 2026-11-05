import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { crearReglaConciliacion } from '@/lib/banco'
import { esUuid } from '@/lib/rls'

// POST /api/banco/reglas { accion: 'crear', patron, cuenta, sentido } | { accion: 'desactivar', id }
// Reglas por concepto (comisiones, seguros…): proponen una cuenta de gasto/ingreso; nunca asientan solas. Solo se desactivan, no se borran.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (b?.accion === 'desactivar' && esUuid(b.id)) {
    const ok = await conRepo(c.empresaId, (repo) => repo.desactivarReglaConciliacion(b.id as string))
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'regla_no_encontrada' }, { status: 404 })
  }
  if (b?.accion !== 'crear') return NextResponse.json({ error: 'datos_no_validos', errores: ['accion: crear o desactivar'] }, { status: 400 })
  const r = await conRepo(c.empresaId, (repo) => crearReglaConciliacion(repo, { patron: String(b.patron ?? ''), cuenta: String(b.cuenta ?? ''), sentido: String(b.sentido ?? '') }, c.usuarioId))
  if (!r.ok) return NextResponse.json({ error: 'regla_no_valida', errores: r.errores }, { status: 422 })
  return NextResponse.json({ id: r.id }, { status: 201 })
}
