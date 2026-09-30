import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { CLAVES_DATOS_RIESGO } from '@central/module-seguros'
import { datosRiesgoAsegura, riesgoAsegura } from '@/lib/seguimiento-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'

export const dynamic = 'force-dynamic'

/** GET ?id= — el riesgo entero (figuras, vínculos, variantes P1…Pn) para su pantalla. */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'Falta el id.' }, { status: 422 })
  const r = await riesgoAsegura(id)
  return NextResponse.json(interpretarRiesgo(r.status, r.json))
}

/**
 * PATCH { oportunidadId, <clave>: {…parcial…}, confirmar?: boolean } — edita y/o confirma los datos del riesgo
 * (cualquier ramo). `<clave>` es EXACTAMENTE UNA de `datosVehiculo` | `datosVivienda` | `datosCapital` |
 * `datosRiesgoLibre`; asegura comprueba que es la del ramo de la oportunidad (400 si no). Reenvía al puerto; el
 * `actor` lo pone el servidor y va el ÚLTIMO (nada del navegador puede suplantarlo).
 *
 * Validación de la forma aquí, antes de hablar con asegura: `confirmar` solo booleano (422) y el cuerpo de datos,
 * un objeto (un array o un texto no es «los datos», 400).
 */
export async function PATCH(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.oportunidadId !== 'string' || body.oportunidadId.trim() === '') {
    return NextResponse.json({ estado: 'invalido', motivo: 'Falta oportunidadId.' }, { status: 422 })
  }
  const claves = CLAVES_DATOS_RIESGO.filter((k) => body[k] !== undefined)
  if (claves.length !== 1) {
    return NextResponse.json({ estado: 'invalido', motivo: `Hace falta exactamente una de estas claves: ${CLAVES_DATOS_RIESGO.join(', ')}.` }, { status: 422 })
  }
  const clave = claves[0]
  const datos = body[clave]
  if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
    return NextResponse.json({ estado: 'invalido', motivo: `${clave} tiene que ser un objeto.` }, { status: 400 })
  }
  if (body.confirmar !== undefined && typeof body.confirmar !== 'boolean') {
    return NextResponse.json({ estado: 'invalido', motivo: 'confirmar tiene que ser true o false.' }, { status: 422 })
  }
  const r = await datosRiesgoAsegura({
    oportunidadId: body.oportunidadId.trim(),
    [clave]: datos,
    ...(typeof body.confirmar === 'boolean' ? { confirmar: body.confirmar } : {}),
    actor: guarda.session.email,
  })
  return NextResponse.json(r.json ?? { estado: 'error', motivo: `HTTP ${r.status}` }, { status: r.status })
}
