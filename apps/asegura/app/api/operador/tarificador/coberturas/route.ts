import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { CABECERA_ACTOR, leerActor } from '@/lib/actor'
import { extraerCoberturas, listarTarificacionesConPdf, SinTablaFichasError } from '@/lib/tarificador-fichas'
import { MENSAJE_SIN_TABLA, esUuid, limiteLista } from '@/lib/tarificador-fichas-reglas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// PDF + IA (corta a 90 s) + BD.
export const maxDuration = 120

/**
 * `GET /api/operador/tarificador/coberturas[?limite=30]` — tarificaciones RPA recientes, si tienen el PDF del
 * proyecto y cómo está la extracción de coberturas. Funciona sin la tabla nueva (`fichasActivas: false`).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const limite = limiteLista(new URL(req.url).searchParams.get('limite'), 30, 100)
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await listarTarificacionesConPdf(correduria.id, limite)
    return NextResponse.json(r, { headers: { 'cache-control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/coberturas', e) }, { status: 503 })
  }
}

/**
 * `POST /api/operador/tarificador/coberturas { tarificacionId }` — «Extraer coberturas» del PDF del proyecto:
 * IA + validación determinista (cita en el PDF, importe en su cita). Sin ficha validada del producto deja la
 * ficha `pendiente`; con ficha validada solo lee los valores del presupuesto y avisa si cambió el condicionado.
 * Gasta IA (pasarela, tope mensual); no envía nada a nadie.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const tarificacionId = b && typeof b.tarificacionId === 'string' ? b.tarificacionId.trim() : ''
  if (!esUuid(tarificacionId)) return NextResponse.json({ estado: 'error', mensaje: 'tarificacionId tiene que ser uuid' }, { status: 400 })
  const actor = leerActor(req.headers.get(CABECERA_ACTOR))
  const firma = actor.tipo === 'desconocido' ? `desconocido:${actor.motivo}` : `${actor.tipo}:${actor.id}`
  try {
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
    const r = await extraerCoberturas(correduria.id, tarificacionId, firma)
    const status = r.estado === 'ok' ? 200 : r.estado === 'no_encontrada' ? 404 : r.estado === 'error_ia' ? 502 : 422
    return NextResponse.json(r, { status })
  } catch (e) {
    if (e instanceof SinTablaFichasError) return NextResponse.json({ estado: 'sin_tabla', mensaje: MENSAJE_SIN_TABLA }, { status: 503 })
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/tarificador/coberturas:post', e) }, { status: 503 })
  }
})
