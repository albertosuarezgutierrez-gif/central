// Respuestas comunes de las rutas `/api/operador/tarificador/grabaciones*` (07/10/2026): quién escribe
// (cabecera x-actor) y el error de BD con el caso «SQL sin aplicar» explicado (503 `tabla_sin_crear`).
import { NextResponse } from 'next/server'
import { CABECERA_ACTOR, leerActor } from './actor'
import { registrarErrorCartera } from './error-cartera'
import { MENSAJE_TABLA_SIN_CREAR, esTablaSinCrear } from './tarificador-grabaciones-reglas'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function quienEscribe(req: Request): string {
  const a = leerActor(req.headers.get(CABECERA_ACTOR))
  return a.tipo === 'desconocido' ? `desconocido:${a.motivo}` : `${a.tipo}:${a.id}`
}

export function errorGrabaciones(contexto: string, e: unknown): NextResponse {
  if (esTablaSinCrear(e)) return NextResponse.json({ estado: 'tabla_sin_crear', mensaje: MENSAJE_TABLA_SIN_CREAR }, { status: 503 })
  return NextResponse.json({ estado: 'error', causa: registrarErrorCartera(contexto, e) }, { status: 503 })
}

export const SIN_CORREDURIA = () => NextResponse.json({ estado: 'error', mensaje: 'no se ha podido resolver la correduría' }, { status: 503 })
