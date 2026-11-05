import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { confirmarConciliacion } from '@/lib/banco'
import { capturarReversion, revirtiendo } from '@/lib/revertir'
import { esUuid } from '@/lib/rls'

// POST /api/banco/conciliar { movimientoId, modo: 'partida', documento, cuenta } | { movimientoId, modo: 'regla', reglaId }
// El usuario CONFIRMA una propuesta: se genera el asiento de cobro/pago y la conciliación en la misma transacción (todo o nada).
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || !esUuid(b.movimientoId)) return NextResponse.json({ error: 'datos_no_validos', errores: ['movimientoId obligatorio'] }, { status: 400 })
  const conf = b.modo === 'partida' && typeof b.documento === 'string' && typeof b.cuenta === 'string'
    ? { movimientoId: b.movimientoId, modo: 'partida' as const, documento: b.documento.slice(0, 120), cuenta: b.cuenta.slice(0, 12) }
    : b.modo === 'regla' && esUuid(b.reglaId) ? { movimientoId: b.movimientoId, modo: 'regla' as const, reglaId: b.reglaId } : null
  if (!conf) return NextResponse.json({ error: 'datos_no_validos', errores: ['modo: partida (documento y cuenta) o regla (reglaId)'] }, { status: 400 })
  const r = await capturarReversion(conRepo(c.empresaId, revirtiendo((repo) => confirmarConciliacion(repo, conf, { usuarioId: c.usuarioId, hoy: new Date() })), { timeout: 20_000 }))
  if (!r.ok) return NextResponse.json({ error: 'conciliacion_no_valida', errores: r.errores }, { status: 422 })
  return NextResponse.json({ asientoId: r.asientoId, metodo: r.metodo }, { status: 201 })
}
