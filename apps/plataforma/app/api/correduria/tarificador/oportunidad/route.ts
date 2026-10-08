import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { leerPresupuestosOportunidad, pedirPresupuestosOportunidad } from '@/lib/tarificador-asegura'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/correduria/tarificador/oportunidad?id= — «Presupuestos de compañías» de la oportunidad: el
 * formulario guardado, el pre-relleno del cliente y los trabajos de los bots (solo lectura).
 */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (!UUID.test(id)) return NextResponse.json({ estado: 'error', mensaje: 'id no es un uuid' }, { status: 400 })
  const r = await leerPresupuestosOportunidad(id)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}

/**
 * POST { oportunidadId, ramo, formulario, extras, companias } — pide PRECIO a los bots de las compañías
 * elegidas (uno por compañía, ligado a la oportunidad). La validación de dominio la repite asegura con el
 * mismo módulo; aquí solo la forma. El actor viaja en la cabecera del puerto (`cabecerasPuerto`).
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || Array.isArray(b)) return NextResponse.json({ estado: 'error', mensaje: 'cuerpo JSON requerido' }, { status: 400 })
  const oportunidadId = typeof b.oportunidadId === 'string' ? b.oportunidadId.trim() : ''
  if (!UUID.test(oportunidadId)) return NextResponse.json({ estado: 'error', mensaje: 'oportunidadId tiene que ser uuid' }, { status: 400 })
  if (typeof b.ramo !== 'string' || !b.ramo.trim()) return NextResponse.json({ estado: 'error', mensaje: 'falta ramo' }, { status: 400 })
  if (!b.formulario || typeof b.formulario !== 'object' || Array.isArray(b.formulario)) {
    return NextResponse.json({ estado: 'error', mensaje: 'falta el formulario' }, { status: 400 })
  }
  if (!Array.isArray(b.companias) || !b.companias.every((c) => typeof c === 'string')) {
    return NextResponse.json({ estado: 'error', mensaje: 'companias tiene que ser una lista' }, { status: 400 })
  }
  const extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? (b.extras as Record<string, unknown>) : {}
  const r = await pedirPresupuestosOportunidad({ oportunidadId, ramo: b.ramo.trim(), formulario: b.formulario, extras, companias: b.companias as string[] })
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
