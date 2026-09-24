import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { libroRegistro } from '@/lib/libro-registro'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET ?año=YYYY → { estado:'ok', año, filas } — libro registro de pólizas intermediadas en vigor ese año. */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const año = Number(new URL(req.url).searchParams.get('año'))
  if (!Number.isInteger(año) || año < 2000 || año > Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).slice(0, 4))) {
    return NextResponse.json({ estado: 'invalida', motivo: 'Año no válido.' }, { status: 422 })
  }
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    return NextResponse.json(await libroRegistro(correduria.id, año))
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/libro-registro', e) }, { status: 500 })
  }
}
