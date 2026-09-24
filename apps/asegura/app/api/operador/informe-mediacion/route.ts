import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { informeMediacionAnual } from '@/lib/informe-mediacion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET ?año=YYYY → { estado:'ok', primas, companias, carteraHoy, quejas }
 * Base del informe anual a la DGSFP. Solo lectura. Año fuera de [2000, año en curso] → 422.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const año = Number(new URL(req.url).searchParams.get('año'))
  const actual = new Date().getUTCFullYear()
  if (!Number.isInteger(año) || año < 2000 || año > actual) {
    return NextResponse.json({ estado: 'invalida', motivo: 'Año no válido.' }, { status: 422 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    return NextResponse.json(await informeMediacionAnual(correduria.id, año))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/informe-mediacion', e) }, { status: 500 })
  }
}
