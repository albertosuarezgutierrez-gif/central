import { NextRequest, NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { acuerdosAsegura, productividadAsegura } from '@/lib/companias-asegura'

export const dynamic = 'force-dynamic'

/**
 * GET /api/correduria/companias/acuerdos?anio=YYYY — acuerdos + claves y
 * productividad de asegura, en UNA llamada para el bloque de compañías. Cada
 * mitad viaja con su propio status: si la productividad falla, los acuerdos se
 * siguen pintando (y al revés), cada uno con su «no se ha podido comprobar».
 */
export async function GET(req: NextRequest) {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta
  const n = Number(req.nextUrl.searchParams.get('anio'))
  const anio = Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
  const [acuerdos, productividad] = await Promise.all([acuerdosAsegura(), productividadAsegura(anio)])
  return NextResponse.json({ acuerdos, productividad })
}
