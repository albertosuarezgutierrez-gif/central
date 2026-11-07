import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { calcularFiniquito } from '@central/module-nominas'
import { entradaFiniquito } from '@/lib/finiquito-entrada'

// Cálculo del finiquito (pantalla /admin/nominas/finiquito). Solo CALCULA (no escribe nada ni da de baja a nadie): la
// regla vive en @central/module-nominas (`calcularFiniquito`, céntimos). El cuerpo → entrada del motor en
// `lib/finiquito-entrada.ts` (euros → céntimos una vez). Modo `simulacion`: las reglas pendientes se LISTAN
// (`cifrasPendientes`) en vez de lanzar; la pantalla lo advierte. Requiere sesión de responsable.

export async function POST(req: Request) {
  try {
    await getSesion()
    const body = await req.json().catch(() => ({}))
    const armada = entradaFiniquito(body && typeof body === 'object' ? body : {})
    if (typeof armada === 'string') return NextResponse.json({ error: armada }, { status: 400 })
    try {
      return NextResponse.json({ resultado: calcularFiniquito(armada.entrada, 'simulacion'), supuestos: armada.supuestos })
    } catch (e) {
      // Entrada que el motor rechaza: se dice, no se inventa un importe.
      return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo calcular' }, { status: 422 })
    }
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
