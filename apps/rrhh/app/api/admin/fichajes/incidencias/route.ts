import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { resumenIncidenciasUbicacion } from '@/lib/fichajes'

// Incidencias de ubicación de los últimos 30 días de la empresa de la SESIÓN.
export async function GET() {
  try {
    const { empresa_id } = await getSesion()
    const incidencias = await resumenIncidenciasUbicacion(empresa_id)
    return NextResponse.json({ incidencias })
  } catch (e) { if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 }); throw e }
}
