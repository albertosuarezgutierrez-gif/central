import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { sustitucionesEnSeguimiento } from '@/lib/cartera-sustituciones'

export const dynamic = 'force-dynamic'

// GET /api/operador/sustituciones — pólizas sustituidas por retarificación
// (cambio de compañía) que llevan ≥3 días esperando a que CIMA confirme la
// nueva. Read-only, gratis. Mismos cuatro estados que el resto del puerto.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ estado: 'error' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const lista = await sustitucionesEnSeguimiento(correduria.id)
    if (lista === null) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', sustituciones: lista })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/sustituciones', e) })
  }
}
