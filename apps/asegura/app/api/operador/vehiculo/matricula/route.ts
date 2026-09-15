import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverMatricula } from '@central/core-vehiculos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/operador/vehiculo/matricula` — consulta de datos técnicos de un
 * vehículo por matrícula (marca, modelo, versión, potencia fiscal…) contra
 * APIVehículo, para rellenar lo que la ficha del cliente no trae.
 *
 * 🚨 Gasta una consulta REAL del plan (0,12€ aprox.) por petición exitosa.
 * Igual que `retarificar`, es un `POST` a propósito: un `GET` se dispararía
 * con un prefetch del navegador o un bot sin que nadie lo pidiera.
 *
 * Solo hace la consulta y la devuelve — NO escribe en `bienes_asegurables`.
 * Dónde aterriza el dato (¿se guarda? ¿solo alimenta el formulario de
 * Codeoscopic?) y cómo se compagina la versión de texto de APIVehículo con
 * el código de versión del catálogo de Codeoscopic son preguntas abiertas,
 * fuera del alcance de esta ruta a propósito.
 *
 * Cuerpo: `{ matricula: string, pais?: 'ES' | 'PT' }`
 */
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const matricula = typeof cuerpo.matricula === 'string' ? cuerpo.matricula.trim() : ''
  if (matricula === '') {
    return NextResponse.json({ estado: 'error', mensaje: 'falta matricula' }, { status: 400 })
  }
  const pais = cuerpo.pais === 'PT' ? 'PT' : 'ES'

  try {
    const vehiculo = await resolverMatricula(matricula, pais)
    if (vehiculo === null) {
      return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    }
    return NextResponse.json({ estado: 'ok', vehiculo })
  } catch (e) {
    const mensaje = String((e as Error)?.message ?? e)
    const status = /límite de consultas/.test(mensaje) ? 429 : 502
    return NextResponse.json({ estado: 'error', mensaje }, { status })
  }
}
