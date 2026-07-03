// apps/plataforma/app/api/contable/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { responder } from '@/lib/contable/cerebro'
import { procesarDocumento } from '@/lib/contable/documentos'
import { resumenDocumento, accionConciliar } from '@/lib/contable/documentos-tipos'
import { guardarAcciones } from '@/lib/contable/acciones'
import { logTurno } from '@/lib/contable/memoria'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Tope defensivo del adjunto: ~8 MB de binario (base64 ≈ 4/3). Un ticket/factura entra de sobra.
const MAX_BASE64 = 11_000_000

export async function POST(req: NextRequest) {
  const session = await requireSession().catch(() => null)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim() : ''
  const adjunto = body?.adjunto

  // --- Rama documento (foto de ticket / PDF de factura) -------------------------------------
  if (adjunto && typeof adjunto.base64 === 'string' && typeof adjunto.mimeType === 'string') {
    if (adjunto.base64.length > MAX_BASE64) {
      return NextResponse.json({ respuesta: 'El archivo es demasiado grande. Súbelo por debajo de 8 MB.' })
    }
    try {
      const buffer = Buffer.from(adjunto.base64, 'base64')
      const nombre = typeof adjunto.fileName === 'string' ? adjunto.fileName : ''
      await logTurno(session.id, 'web', 'user', `[documento: ${nombre || adjunto.mimeType}]`)
      const doc = await procesarDocumento(session.id, buffer, adjunto.mimeType, nombre)
      if (!doc.ok) {
        await logTurno(session.id, 'web', 'assistant', doc.motivo)
        return NextResponse.json({ respuesta: doc.motivo, guardados: [], acciones: [] })
      }
      const respuesta = resumenDocumento(doc.factura, doc.match)
      const prop = accionConciliar(doc.factura, doc.match)
      const acciones = prop ? await guardarAcciones(session.id, [prop]) : []
      await logTurno(session.id, 'web', 'assistant', respuesta)
      return NextResponse.json({ respuesta, guardados: [], acciones })
    } catch (e: any) {
      const msg = String(e?.message || e)
      if (msg.includes('NVIDIA_API_KEY')) {
        return NextResponse.json({ respuesta: 'Para leer documentos necesito la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma.' })
      }
      return NextResponse.json({ respuesta: 'No pude leer el documento: ' + msg.slice(0, 140) })
    }
  }

  // --- Rama texto ---------------------------------------------------------------------------
  if (!mensaje) return NextResponse.json({ error: 'mensaje requerido' }, { status: 400 })
  try {
    // session.id === cuenta_id (ver lib/tenant.ts / requireEmpresaId).
    const { respuesta, guardados, acciones } = await responder(session.id, mensaje, 'web')
    return NextResponse.json({ respuesta, guardados, acciones })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('NVIDIA_API_KEY')) {
      return NextResponse.json({ respuesta: 'El agente necesita la variable NVIDIA_API_KEY en el proyecto Vercel de plataforma.' })
    }
    return NextResponse.json({ respuesta: 'No se pudo consultar al agente: ' + msg.slice(0, 140) })
  }
}
