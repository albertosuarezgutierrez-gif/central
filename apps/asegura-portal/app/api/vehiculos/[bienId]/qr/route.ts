import { NextResponse } from 'next/server'

import { enlaceDeVehiculo } from '@/lib/enlace-hoja'
import { requireIdentidad } from '@/lib/session'
import { puedeGestionarVehiculo } from '@/lib/vehiculo-acceso'
import { crearQrVehiculo } from '@/lib/vehiculo-qr'

import { NO_ENCONTRADO, SIN_ENLACE, SIN_SESION, puertaDelVehiculo } from '../../comun'

export const runtime = 'nodejs'

/**
 * Crear (o REIMPRIMIR) la etiqueta QR de un vehículo. Reimprimir anula la anterior: el papel pegado deja de valer.
 *
 * 🚨 El token EN CLARO solo sale en esta respuesta, dentro del enlace: en la BD vive su hash. Y sin dominio https
 * configurado, 503 SIN escribir la fila (una pegatina que no lleva a ningún sitio no se arregla después).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ bienId: string }> }) {
  if (enlaceDeVehiculo('x') === null) return NextResponse.json(SIN_ENLACE, { status: 503 })
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

  const r = await crearQrVehiculo(identidad.id, g)
  if (!r.ok) {
    return NextResponse.json(
      { error: 'concurrente', mensaje: 'Se estaba creando otra etiqueta de este vehículo a la vez. Recarga y vuelve a intentarlo.' },
      { status: 409 },
    )
  }
  return NextResponse.json({ id: r.id, enlace: enlaceDeVehiculo(r.token) }, { status: 201 })
}
