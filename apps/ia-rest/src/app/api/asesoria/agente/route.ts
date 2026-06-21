export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sesionAceptable } from '@/lib/session-sign'
import { callAI } from '@/lib/ai-client'

function getAsesoriaSession(req: NextRequest) {
  const raw = req.headers.get('x-asesoria-session')
  if (!raw) return null
  try {
    const p = JSON.parse(raw)
    if (!sesionAceptable(p, 'objeto')) return null
    return p as { contable_id: string; nombre: string; restaurantes: { id: string; nombre: string }[] }
  } catch { return null }
}

const SYSTEM = `Eres el asistente contable de ia.rest, ayudas a asesores fiscales y contables externos.
Contexto: portal /asesoria con acceso a IVA 303, cierres diarios, facturas VeriFactu, exportaciones A3/Sage/Holded.

FUNCIONES QUE PUEDES EXPLICAR:
- Resumen financiero: ventas, gastos y beneficio por restaurante y período.
- IVA 303: liquidación trimestral desglosada (10% y 21%). Exportable.
- Cierre diario: arqueos y cierres de caja por turno.
- Facturas VeriFactu: listado con hash SHA-256 y QR AEAT.
- Exportación: A3, Sage, Holded, CSV — botón por sección.
- Asientos contables: PGC adaptado a hostelería española.

TONO: profesional, conciso. Máximo 3-4 frases. Idioma: español.
NUNCA inventes cifras ni hagas deducciones sin datos.`

export async function POST(req: NextRequest) {
  const session = getAsesoriaSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { messages } = await req.json()
  if (!messages?.length) return NextResponse.json({ error: 'messages requerido' }, { status: 400 })

  const historial = (messages as { role: string; content: string }[])
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
    .join('\n')

  const respuesta = await callAI(SYSTEM, historial, 400).catch(() => 'Error al procesar la consulta.')

  return NextResponse.json({ reply: respuesta })
}
