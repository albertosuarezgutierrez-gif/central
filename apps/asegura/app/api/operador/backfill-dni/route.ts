import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { backfillDniLookupHash } from '@/lib/backfill-dni'

export const dynamic = 'force-dynamic'
// Descifrar ~32.600 fichas y hashearlas no cabe en el default de 10 s.
export const maxDuration = 300

/**
 * GET /api/operador/backfill-dni — plan EN SECO del backfill del blind index de
 * DNI. No escribe nada. Devuelve cuántas fichas se pueden rellenar, cuántas
 * chocan (= DNI repetido = candidatos a fusión) y cuántas tienen el DNI
 * ilegible.
 *
 * Es el paso 1 de los tres que explica `packages/module-seguros/src/backfill-dni.ts`.
 * El paso 2 (fusionar los choques) es un lote SQL con el OK de Alberto delante
 * de los nombres; el 3 es el POST de aquí.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await backfillDniLookupHash(correduria.id, { seco: true })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/backfill-dni', e) },
      { status: 500 },
    )
  }
}

/**
 * POST /api/operador/backfill-dni — ESCRIBE los hashes que no chocan.
 *
 * Idempotente: sólo toca fichas con `dni_lookup_hash` a NULL, así que repetirlo
 * no cambia nada. Las que chocan se quedan como están a propósito — escribirlas
 * exigiría decidir quién sobrevive, y eso no lo decide un endpoint.
 *
 * Pide `{"confirmar":"escribir"}` en el cuerpo: es una escritura sobre 15.800
 * fichas de la cartera y no debe salir de un `curl` a medio escribir.
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || body.confirmar !== 'escribir') {
      return NextResponse.json(
        { estado: 'invalido', motivo: 'falta {"confirmar":"escribir"}' },
        { status: 422 },
      )
    }
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await backfillDniLookupHash(correduria.id, { seco: false })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('operador/backfill-dni', e) },
      { status: 500 },
    )
  }
}
