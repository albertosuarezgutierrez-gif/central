import { NextRequest, NextResponse } from 'next/server'
import { accesoEmpresas } from '@/lib/empresas-acceso'
import { investigarEmpresa } from '@/lib/empresas-websearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

// Investigación web (gratis) de una empresa concreta. La IA solo resume/cita lo que la búsqueda devuelve.
export async function POST(req: NextRequest) {
  if (!(await accesoEmpresas())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { nombre?: unknown; provincia?: unknown }
  const nombre = typeof body.nombre === 'string' ? body.nombre.slice(0, 200) : ''
  if (!nombre.trim()) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const provincia = typeof body.provincia === 'string' && body.provincia ? body.provincia : undefined
  try {
    const r = await investigarEmpresa(nombre, provincia)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[empresas investigar]', e)
    return NextResponse.json({ ok: false, text: '', error: 'La búsqueda no está disponible ahora mismo.' })
  }
}
