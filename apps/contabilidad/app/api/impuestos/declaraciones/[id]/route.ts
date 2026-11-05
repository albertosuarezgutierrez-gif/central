import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conEmpresa } from '@/lib/db'
import { esUuid } from '@/lib/rls'
import { repoSql } from '@/lib/repo'
import { repoF4Sql } from '@/lib/repo-f4'
import { devolverDeclaracion, presentarDeclaracion, revisarDeclaracion, type ResultadoCiclo, type ResultadoPresentar } from '@/lib/impuestos'
import { capturarReversion, Revertir } from '@/lib/revertir'

// POST /api/impuestos/declaraciones/<id> { accion: 'revisar' | 'devolver' | 'presentar', fechaPresentacion?, justificante?, pagar? }
// «Presentar» NO envía nada a la AEAT: registra que el titular o su gestor ya lo presentó con su certificado digital (fecha + referencia del
// justificante, en texto) y genera los asientos de liquidación/pago. Todo o nada: si un asiento falla, no queda nada a medias.
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { id } = await params
  if (!esUuid(id)) return NextResponse.json({ error: 'id_invalido' }, { status: 400 })
  const b = (await req.json().catch(() => null)) as { accion?: unknown; fechaPresentacion?: unknown; justificante?: unknown; pagar?: unknown } | null
  if (!b || (b.accion !== 'revisar' && b.accion !== 'devolver' && b.accion !== 'presentar')) {
    return NextResponse.json({ error: 'datos_no_validos', errores: ['accion: revisar | devolver | presentar'] }, { status: 400 })
  }
  const e = c.empresaId.toLowerCase()
  const meta = { usuarioId: c.usuarioId, rol: c.rol, hoy: new Date() }
  const r = await capturarReversion<ResultadoCiclo | ResultadoPresentar>(conEmpresa(c.empresaId, async (tx) => {
    const repo = repoSql(tx, e)
    const f4 = repoF4Sql(tx, e)
    const res = b.accion === 'revisar' ? await revisarDeclaracion(repo, f4, id, meta)
      : b.accion === 'devolver' ? await devolverDeclaracion(repo, f4, id, meta)
        : await presentarDeclaracion(repo, f4, id, { fechaPresentacion: typeof b.fechaPresentacion === 'string' ? b.fechaPresentacion : '', justificante: typeof b.justificante === 'string' ? b.justificante : '' }, { pagar: b.pagar === true }, meta)
    if (!res.ok) throw new Revertir(res)
    return res
  }, { timeout: 30_000 })).catch(() => null)
  if (r === null) return NextResponse.json({ error: 'impuestos_no_disponible', errores: ['No se pudo completar la operación (¿falta aplicar el esquema de la fase 4, 0004_impuestos.sql?).'] }, { status: 503 })
  if (!r.ok) return NextResponse.json({ error: 'no_permitido', errores: r.errores }, { status: 422 })
  return NextResponse.json(r, { status: 200 })
}
