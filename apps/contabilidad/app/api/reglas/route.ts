import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { guardarReglaEmpresa } from '@/lib/reglas'

// POST /api/reglas { tipo, cuentas } — guarda una VERSIÓN NUEVA de la regla del tipo de hecho (solo el dueño; el gestor ve, no cambia).
// Cada cuenta debe existir en el plan de la empresa y ser de nivel hoja. No reescribe asientos pasados.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (c.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede cambiar las reglas de asiento' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as { tipo?: unknown; cuentas?: unknown } | null
  if (!b || typeof b.tipo !== 'string') return NextResponse.json({ error: 'datos_no_validos', errores: ['tipo y cuentas obligatorios'] }, { status: 400 })
  const r = await conRepo(c.empresaId, (repo) => guardarReglaEmpresa(repo, b.tipo as string, b.cuentas, c.usuarioId))
  if (!r.ok) return NextResponse.json({ error: 'reglas_no_validas', errores: r.errores }, { status: 422 })
  return NextResponse.json({ version: r.version }, { status: 201 })
}
