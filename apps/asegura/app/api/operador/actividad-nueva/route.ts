import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { actividadNueva } from '@/lib/actividad-cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lo que han hecho los CLIENTES en el portal desde un instante, para el aviso
 * por Telegram de plataforma (`correduria-actividad`, cada 5 min).
 *
 *   GET ?desde=<ISO>&limite=<n>   → { estado:'ok', eventos: [...], total }
 *
 * Mismo muro que `/actividad` (mismas fuentes, mismos tipos, sin datos de
 * contacto), pero solo lo del cliente, en orden ASCENDENTE y sin el embudo.
 * Inclusivo (`>=`): quien llama deduplica por `tipo:id`.
 *
 * `desde` es obligatorio: sin él no se devuelve «todo» — el vigía lo leería
 * como un aluvión de novedades.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const desde = new Date((q.get('desde') ?? '').trim())
  if (Number.isNaN(desde.getTime())) {
    return NextResponse.json({ estado: 'invalido', motivo: 'desde no es una fecha' }, { status: 422 })
  }
  const limiteBruto = Number(q.get('limite') ?? '100')
  const limite = Number.isFinite(limiteBruto) ? Math.min(200, Math.max(1, Math.trunc(limiteBruto))) : 100

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const r = await actividadNueva(correduria.id, desde, limite)
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 500 })
  } catch (e) {
    // Un fallo de lectura sale con su CAUSA (credenciales, conexión…), no
    // pelado: el latido del cron de plataforma la enseña y dice dónde mirar.
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/actividad-nueva', e) }, { status: 500 })
  }
}
