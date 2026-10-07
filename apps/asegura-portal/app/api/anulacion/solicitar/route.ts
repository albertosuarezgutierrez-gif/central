import { after, NextResponse } from 'next/server'

import { solicitar, type CuerpoSolicitudBaja } from '@/lib/anulacion-firma'
import { avisarBajaSolicitada } from '@/lib/aviso-baja-solicitada'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MOTIVOS = ['venta', 'precio', 'otro'] as const

function texto(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined
}

/**
 * POST /api/anulacion/solicitar — el cliente pide la baja de SU póliza (nace retenida 48 h; ver asegura).
 *   { polizaId, motivo:'venta'|'precio'|'otro', fechaVenta?, motivoTexto?, ofertaPrecioVista?, competidor?, precioOfrecido? }
 *
 * La identidad sale de la SESIÓN, nunca del cuerpo; la póliza la valida asegura contra la ficha vinculada. 🚨 La vista de
 * corredor es de solo lectura: Alberto no pide una baja por el cliente (403 antes de llamar al puente). Reenvía el status
 * del puente (201 / 403 / 409 / 422). Si se crea, avisa a Alberto por Telegram SIN esperar y sin poder tumbar la respuesta.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const polizaId = typeof b?.polizaId === 'string' ? b.polizaId.trim() : ''
  const motivo = MOTIVOS.find((m) => m === b?.motivo)
  if (!b || polizaId === '' || !motivo) return NextResponse.json({ estado: 'invalido', motivo: 'Elige la póliza y el motivo.' }, { status: 422 })

  // Lista blanca: solo lo que el puente entiende; `identidadId` lo pone `solicitar()` desde la sesión.
  const cuerpo: CuerpoSolicitudBaja = {
    polizaId, motivo,
    fechaVenta: texto(b.fechaVenta, 10),
    motivoTexto: texto(b.motivoTexto, 500),
    ofertaPrecioVista: b.ofertaPrecioVista === true ? true : undefined,
    competidor: texto(b.competidor, 120),
    precioOfrecido: texto(typeof b.precioOfrecido === 'number' ? String(b.precioOfrecido) : b.precioOfrecido, 20),
  }
  const { status, resultado: r } = await solicitar(identidad.id, cuerpo)
  if (r.estado === 'ok') {
    after(async () => {
      await avisarBajaSolicitada({
        polizaId: r.poliza.id || polizaId, compania: r.poliza.compania, numeroPoliza: r.poliza.numeroPoliza,
        motivo: r.motivo || motivo, motivoTexto: r.motivoTexto, liberaSolaAt: r.liberada ? null : r.liberaSolaAt,
      })
    })
    return NextResponse.json({ estado: 'ok', liberada: r.liberada, liberaSolaAt: r.liberaSolaAt, advertencia: r.advertencia }, { status: 201 })
  }
  if (r.estado === 'error') return NextResponse.json({ estado: 'error' }, { status: 502 })
  return NextResponse.json(r, { status: status >= 400 && status < 500 ? status : 409 })
}
