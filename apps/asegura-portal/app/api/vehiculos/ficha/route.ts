import { NextResponse } from 'next/server'

import { asegurarVehiculosDeFlota } from '@/lib/flota'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'
import { asegurarVehiculoDePoliza, puedeGestionarVehiculo } from '@/lib/vehiculo-acceso'

import { ESTADO_HTTP_FLOTA } from '../../flota/estado-http'
import { DATOS_INVALIDOS, NO_ENCONTRADO, SIN_SESION, cuerpoJson } from '../comun'

export const runtime = 'nodejs'

const ESTADO_FICHA = { no_encontrada: 404, no_es_vehiculo: 400, no_vigente: 409, es_de_empresa: 409, sin_matricula: 409, datos_invalidos: 400 } as const

/**
 * La FICHA del vehículo al que se le va a colgar un QR, creada bajo demanda e idempotente.
 *  - Particular: `{ polizaId, matricula?, fechaMatriculacion? }` → `asegurarVehiculoDePoliza` (solo una póliza
 *    PROPIA de auto/moto; la matrícula del cuerpo solo vale si la compañía no la informa).
 *  - Empresa: `{ empresaId, polizaId }` → `asegurarVehiculosDeFlota` (empresa y póliza buscadas dentro de la flota).
 * Después, el bien creado pasa por `puedeGestionarVehiculo` como cualquier otro: lo que no resuelve es 404.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json(SIN_SESION, { status: 401 })
  }
  const c = await cuerpoJson(req)
  if (c === null) return NextResponse.json(DATOS_INVALIDOS, { status: 400 })

  let bienId: string
  if (c.empresaId !== undefined) {
    if (!(await puertaDeSesion('flota', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
    const r = await asegurarVehiculosDeFlota({ identidadId: identidad.id, empresaId: c.empresaId, polizaIds: [c.polizaId] })
    if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP_FLOTA[r.error] })
    const primero = r.vehiculos[0]
    if (!primero) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    bienId = primero.bienId
  } else {
    const r = await asegurarVehiculoDePoliza(identidad.id, {
      polizaId: c.polizaId,
      matricula: c.matricula,
      fechaMatriculacion: c.fechaMatriculacion,
    })
    if (!r.ok) return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_FICHA[r.error] })
    bienId = r.bienId
  }

  const g = await puedeGestionarVehiculo(identidad.id, bienId)
  if (g === null) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
  return NextResponse.json({ bienId: g.bienId })
}
