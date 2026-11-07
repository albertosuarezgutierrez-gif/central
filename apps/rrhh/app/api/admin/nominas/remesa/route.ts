/**
 * Remesa SEPA (pain.001, propósito SALA) de las nóminas CONFIRMADAS del periodo, como descarga XML.
 *   GET  ?periodo=YYYY-MM&fecha=YYYY-MM-DD
 *   POST { periodo, fecha_ejecucion }
 * `empresa_id` SOLO de getSesion() (cepo `lib/aislamiento-nominas.test.ts`). Con cualquier problema (IBAN ausente o
 * inválido, líquido desconocido…) responde 422 con la lista de empleados afectados y NO sale fichero.
 * 🚨 Ningún IBAN a logs ni en los mensajes de error.
 */
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { armarRemesaNominas } from '@/lib/remesa-nominas'
import { cargarDatosRemesa } from '@/lib/remesa-nominas-datos'

function hoyMadrid(ahora: Date): string {
  // en-CA formatea YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

async function responder(periodo: unknown, fecha: unknown): Promise<Response> {
  let empresa_id: string
  try {
    ({ empresa_id } = await getSesion())
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }

  if (typeof periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo debe ser YYYY-MM' }, { status: 400 })
  }
  const ahora = new Date()
  const hoy = hoyMadrid(ahora)
  const fechaEjecucion = typeof fecha === 'string' && fecha ? fecha : hoy

  const datos = await cargarDatosRemesa(empresa_id, periodo)
  if (!datos.empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const r = armarRemesaNominas({ ...datos, empresa: datos.empresa, periodo, fechaEjecucion, hoy, creadoEn: ahora })
  if (!r.ok) {
    return NextResponse.json({ error: 'No se puede generar la remesa', errores: r.errores, no_confirmadas: r.no_confirmadas }, { status: 422 })
  }

  return new Response(r.xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.nombreFichero}"`,
      'Cache-Control': 'no-store',
      'X-Remesa-Transferencias': String(r.num_transferencias),
      'X-Remesa-Total-Centimos': String(r.total_centimos),
      'X-Remesa-No-Confirmadas': String(r.no_confirmadas),
    },
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  return responder(searchParams.get('periodo'), searchParams.get('fecha'))
}

export async function POST(req: Request) {
  const datos = await req.json().catch(() => ({})) as { periodo?: unknown; fecha_ejecucion?: unknown }
  return responder(datos.periodo, datos.fecha_ejecucion)
}
