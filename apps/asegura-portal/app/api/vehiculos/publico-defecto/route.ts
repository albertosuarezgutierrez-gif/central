import { NextResponse } from 'next/server'

import { interruptoresDelCuerpo } from '@central/module-seguros-portal'

import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'
import { puedeGestionarDefecto } from '@/lib/vehiculo-acceso'
import { guardarPublicoDefecto } from '@/lib/vehiculo-qr'

import { DATOS_INVALIDOS, NO_ENCONTRADO, SIN_SESION, cuerpoJson } from '../comun'

export const runtime = 'nodejs'

/**
 * El DEFECTO de qué ve quien escanea los vehículos de un dueño: `{ ambito: 'persona', valores }` (los de esta
 * identidad) o `{ ambito: 'empresa', empresaId, valores }` (una sociedad buscada DENTRO de `accesosFlota`, con
 * papel para editar). Lo demás, 404.
 */
export async function PUT(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json(SIN_SESION, { status: 401 })
  }
  const c = await cuerpoJson(req)
  if (c === null) return NextResponse.json(DATOS_INVALIDOS, { status: 400 })
  const ambito = await puedeGestionarDefecto(identidad.id, c)
  if (ambito === null) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
  if (ambito.clienteId !== undefined && !(await puertaDeSesion('flota', 'escritura'))) {
    return NextResponse.json(SIN_ACCESO, { status: 403 })
  }
  const valores = interruptoresDelCuerpo(c.valores)
  if (valores === null) return NextResponse.json(DATOS_INVALIDOS, { status: 400 })
  await guardarPublicoDefecto(identidad.id, ambito, valores)
  return NextResponse.json({ ok: true })
}
