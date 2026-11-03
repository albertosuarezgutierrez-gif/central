import { NextResponse } from 'next/server'

import { interruptoresDelCuerpo } from '@central/module-seguros-portal'

import { requireIdentidad } from '@/lib/session'
import { puedeGestionarVehiculo } from '@/lib/vehiculo-acceso'
import { guardarPublicoVehiculo } from '@/lib/vehiculo-qr'

import { DATOS_INVALIDOS, NO_ENCONTRADO, SIN_SESION, cuerpoJson, puertaDelVehiculo } from '../../comun'

export const runtime = 'nodejs'

/**
 * Qué ve quien escanea ESTE vehículo (excepción sobre el defecto del dueño). Cuerpo: los TRES booleanos
 * (`datosCarretera`, `estadoAlDia`, `recordatoriosPendientes`); uno a medias es 400. El dueño de la fila sale del
 * bien resuelto, nunca del cuerpo.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ bienId: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json(SIN_SESION, { status: 401 })
  }
  const { bienId } = await params
  const g = await puedeGestionarVehiculo(identidad.id, bienId)
  if (g === null) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
  const cerrada = await puertaDelVehiculo(g)
  if (cerrada) return cerrada
  const valores = interruptoresDelCuerpo(await cuerpoJson(req))
  if (valores === null) return NextResponse.json(DATOS_INVALIDOS, { status: 400 })
  await guardarPublicoVehiculo(identidad.id, g, valores)
  return NextResponse.json({ ok: true })
}
