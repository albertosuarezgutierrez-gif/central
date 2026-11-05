import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { registrarPago } from '@/lib/compras'
import { capturarReversion, revirtiendo } from '@/lib/revertir'

// POST /api/pagos { documento, cuenta?, importe (céntimos), fecha, medio } — pago total o parcial de una factura recibida pendiente.
// Medio efectivo → caja (570); resto → bancos (572). Todo o nada.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: 'datos_no_validos', errores: ['cuerpo JSON obligatorio'] }, { status: 400 })
  const entrada = {
    documento: typeof b.documento === 'string' ? b.documento.slice(0, 120) : '', ...(typeof b.cuenta === 'string' ? { cuenta: b.cuenta.slice(0, 12) } : {}),
    importe: b.importe as number, fecha: typeof b.fecha === 'string' ? b.fecha : '', medio: b.medio as never,
  }
  const r = await capturarReversion(conRepo(c.empresaId, revirtiendo((repo) => registrarPago(repo, entrada, { usuarioId: c.usuarioId, hoy: new Date() })), { timeout: 20_000 }))
  if (!r.ok) return NextResponse.json({ error: 'pago_no_valido', errores: r.errores }, { status: 422 })
  return NextResponse.json({ asientoId: r.asientoId, pendienteTras: r.pendienteTras }, { status: 201 })
}
