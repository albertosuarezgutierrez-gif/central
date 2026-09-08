import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { backfillContactoLookupHash, SinClaveDeIndice } from '@/lib/backfill-contacto'

export const dynamic = 'force-dynamic'
// Descifrar ~32.000 fichas × 2 campos más las tablas hijas no cabe en 10 s.
export const maxDuration = 300

/**
 * GET /api/operador/backfill-contacto — plan EN SECO del backfill del blind
 * index de email y teléfono (ficha + tablas hijas). No escribe nada.
 *
 * Por qué existe (08/09/2026): el buscador de `/correduria` encuentra un email
 * o un teléfono SOLO por su hash, y había 250 fichas con email, 100 emails
 * secundarios y 91 teléfonos con el dato guardado y el hash a NULL. Para ésas,
 * teclear el correo correcto decía «nadie coincide».
 *
 * Los `choques` son fichas que comparten email (`uq_clientes_email_lookup_hash`
 * es UNIQUE): no se escriben, se devuelven como grupos de ids. Ni el email ni
 * el teléfono ni el hash cruzan el puerto.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await backfillContactoLookupHash(correduria.id, { seco: true })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    if (e instanceof SinClaveDeIndice) return NextResponse.json({ estado: 'error', motivo: e.message }, { status: 503 })
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/backfill-contacto', e) },
      { status: 500 },
    )
  }
}

/**
 * POST /api/operador/backfill-contacto — ESCRIBE los hashes que no chocan.
 *
 * Idempotente: sólo toca filas con el hash a NULL. Pide `{"confirmar":"escribir"}`
 * en el cuerpo y admite `{"limite":N}` para escribir por tandas.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || body.confirmar !== 'escribir') {
      return NextResponse.json({ estado: 'invalido', motivo: 'falta {"confirmar":"escribir"}' }, { status: 422 })
    }
    const limite = typeof body.limite === 'number' && Number.isFinite(body.limite) && body.limite > 0
      ? Math.floor(body.limite)
      : undefined
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await backfillContactoLookupHash(correduria.id, { seco: false, limite })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    if (e instanceof SinClaveDeIndice) return NextResponse.json({ estado: 'error', motivo: e.message }, { status: 503 })
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/backfill-contacto', e) },
      { status: 500 },
    )
  }
}
