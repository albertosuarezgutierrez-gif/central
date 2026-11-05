import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { anadirCuentasDePlantilla, guardarActividad } from '@/lib/actividad'

// POST /api/actividad { accion: 'guardar', cnae?, sector? } | { accion: 'anadir_cuentas', sector }
// La app SUGIERE la plantilla por CNAE; el dueño o el gestor CONFIRMA o la cambia aquí. Cambiar la plantilla vale para lo que se asiente
// después (no reescribe asientos pasados). Añadir cuentas de otra plantilla nunca quita ni modifica cuentas.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (b?.accion === 'anadir_cuentas') {
    const r = await conRepo(c.empresaId, (repo) => anadirCuentasDePlantilla(repo, b.sector, c.usuarioId))
    return r.ok ? NextResponse.json({ anadidas: r.anadidas }, { status: 201 }) : NextResponse.json({ error: 'datos_no_validos', errores: r.errores }, { status: 422 })
  }
  if (b?.accion !== 'guardar') return NextResponse.json({ error: 'datos_no_validos', errores: ['accion: guardar o anadir_cuentas'] }, { status: 400 })
  const r = await conRepo(c.empresaId, (repo) => guardarActividad(repo, { cnae: b.cnae, sector: b.sector }, c.usuarioId))
  return r.ok ? NextResponse.json({ cnae: r.cnae, sugerencia: r.sugerencia }, { status: 201 }) : NextResponse.json({ error: 'datos_no_validos', errores: r.errores }, { status: 422 })
}
