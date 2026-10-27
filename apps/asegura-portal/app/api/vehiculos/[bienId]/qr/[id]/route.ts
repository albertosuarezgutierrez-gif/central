import { NextResponse } from 'next/server'

import { requireIdentidad } from '@/lib/session'
import { puedeGestionarVehiculo } from '@/lib/vehiculo-acceso'
import { anularQrVehiculo } from '@/lib/vehiculo-qr'

import { NO_ENCONTRADO, SIN_SESION, puertaDelVehiculo } from '../../../comun'

export const runtime = 'nodejs'

/**
 * Anular la etiqueta QR de un vehículo. NO borra la fila (el rol ni siquiera tiene DELETE): queda la fecha de
 * cuándo dejó de abrir nada. 404 si no es tuya o ya estaba anulada (la fecha que consta es la de la primera vez).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ bienId: string; id: string }> }) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json(SIN_SESION, { status: 401 })
  }
  const { bienId, id } = await params
  const g = await puedeGestionarVehiculo(identidad.id, bienId)
  if (g === null) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
  const cerrada = await puertaDelVehiculo(g)
  if (cerrada) return cerrada
  if (!(await anularQrVehiculo(identidad.id, g, id))) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
  return NextResponse.json({ ok: true })
}
