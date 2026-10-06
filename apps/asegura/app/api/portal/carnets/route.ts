import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { caducidadesCarnetDeIdentidad, escribirCarnetPortal } from '@/lib/carnets-portal'
import { leerOperacionCarnet, statusCarnetPortal } from '@/lib/carnets-portal-reglas'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/portal/carnets?identidadId= — los carnés de conducir de las fichas
 * vinculadas a esa identidad, AGRUPADOS POR TITULAR, con su próxima caducidad
 * ya calculada (nunca las fechas de origen — ver `lib/carnets-portal.ts`).
 * `ok` (un titular, con la lista plana de siempre) · `varios_titulares` (200,
 * solo `titulares`) · `sin_ficha` (409) · `error` (503).
 *
 * Mismo secreto y misma resolución por `portal_vinculo` que
 * `/api/portal/contacto`: no acepta `clienteId`.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const identidadId = (new URL(req.url).searchParams.get('identidadId') ?? '').trim()
    if (identidadId === '') return NextResponse.json({ estado: 'invalido', motivo: 'sin identidad' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await caducidadesCarnetDeIdentidad(correduria.id, identidadId)
    const status = r.estado === 'ok' || r.estado === 'varios_titulares' ? 200 : r.estado === 'error' ? 503 : 409
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/carnets', e) },
      { status: 503 },
    )
  }
}

/**
 * POST   { identidadId, fichaId, tipo, fecha }      → el cliente añade un carné a esa ficha
 * PATCH  { identidadId, fichaId, id, tipo, fecha }  → corrige tipo y/o fecha de expedición
 * DELETE { identidadId, fichaId, id }               → lo quita
 *
 * Mismo secreto que la GET. `identidadId` es la de la SESIÓN del portal; `fichaId` (el titular que eligió)
 * se acepta solo si está vinculada a esa identidad con nivel que opera, y en cambio/baja el carné tiene que
 * ser de esa ficha (`carnets-portal-reglas.ts`). Nunca acepta `clienteId`. Respuestas: `ok` 200 ·
 * `invalido` 422 · `duplicado` 409 · `no_encontrado` 404 · `sin_ficha` 409 · `error` 503. Solo dice cómo
 * salió: ni la fecha ni ningún dato de la ficha vuelven por aquí.
 */
export const POST = escribir
export const PATCH = escribir
export const DELETE = escribir

async function escribir(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const op = leerOperacionCarnet(req.method, await req.json().catch(() => null))
    if (!op) return NextResponse.json({ estado: 'invalido', motivo: 'datos_invalidos' }, { status: 422 })

    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })

    const r = await escribirCarnetPortal(correduria.id, op)
    return NextResponse.json(r, { status: statusCarnetPortal(r.estado), headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: registrarErrorCartera('portal/carnets', e) },
      { status: 503 },
    )
  }
}
