import { NextResponse } from 'next/server'

import { exigirCorreduria } from '@/lib/correduria-acceso'
import { extraerCoberturasTarificador, listarTarificacionesConPdf } from '@/lib/tarificador-fichas-asegura'

export const dynamic = 'force-dynamic'
// Asegura lee el PDF y pregunta a la IA (corta a 90 s; su ruta declara 120 s).
export const maxDuration = 150

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** GET /api/correduria/tarificador/coberturas[?limite=30] — tarificaciones del bot con PDF y estado de la extracción. */
export async function GET(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const n = Number(new URL(req.url).searchParams.get('limite') ?? 30)
  const limite = Number.isInteger(n) && n >= 1 && n <= 100 ? n : 30
  const r = await listarTarificacionesConPdf(limite)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status, headers: { 'cache-control': 'private, no-store' } })
}

/**
 * POST /api/correduria/tarificador/coberturas { tarificacionId } — «Extraer coberturas» del PDF del proyecto.
 * Gasta IA (pasarela con tope); no envía nada a nadie ni toca la póliza. Reenvía estado y JSON de asegura.
 */
export async function POST(req: Request) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const tarificacionId = b && typeof b.tarificacionId === 'string' ? b.tarificacionId.trim() : ''
  if (!UUID.test(tarificacionId)) return NextResponse.json({ estado: 'error', mensaje: 'tarificacionId tiene que ser uuid' }, { status: 400 })
  const r = await extraerCoberturasTarificador(tarificacionId)
  return NextResponse.json(r.json ?? { estado: 'error' }, { status: r.status })
}
