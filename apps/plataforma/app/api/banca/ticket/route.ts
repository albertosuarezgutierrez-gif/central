import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ocrTicket, guardarTicket, listarTickets, tipoImagenValido } from '@/lib/tickets'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET  /api/banca/ticket → últimos tickets de la cuenta.
// POST /api/banca/ticket (multipart, campo "file" = imagen) → OCR del ticket + guardado.
// Degrada limpio: sin IA devuelve nota; si las tablas aún no están aplicadas, devuelve el OCR
// (parsed) con guardado:false y una nota para aplicar la migración.

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const tickets = await listarTickets(session.id, 20)
    return NextResponse.json({ tickets })
  } catch {
    // Tablas aún no aplicadas u otro fallo: no rompas la página.
    return NextResponse.json({ tickets: [] })
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    return NextResponse.json({ error: 'Envía la imagen como multipart/form-data (campo "file").' }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: 'Falta la imagen del ticket.' }, { status: 400 })
  if (!tipoImagenValido(file.type)) {
    return NextResponse.json({ error: 'Formato no soportado. Sube una foto JPG, PNG o WEBP.' }, { status: 400 })
  }
  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json({ error: 'La imagen es muy grande (máx. 12 MB).' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const parsed = await ocrTicket(base64, file.type)
  if (!parsed) {
    return NextResponse.json({ ok: false, nota: 'No he podido leer el ticket. Prueba con una foto más nítida y bien encuadrada.' })
  }

  try {
    const guardado = await guardarTicket(session.id, parsed)
    return NextResponse.json({ ok: true, guardado: true, ticketId: guardado.id, parsed })
  } catch (e) {
    console.error('[ticket] guardar', e)
    // El OCR salió bien pero no se pudo persistir (p. ej. migración sin aplicar): devuelve lo leído.
    return NextResponse.json({ ok: true, guardado: false, parsed, nota: 'Leí el ticket pero aún no puedo guardarlo (falta aplicar la tabla tickets_compra).' })
  }
}
