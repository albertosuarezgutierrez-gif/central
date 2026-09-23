import { NextResponse } from 'next/server'

import { guardarDocumentoPropio } from '@/lib/documento-portal'
import { rateLimit } from '@/lib/rate-limit'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * POST /api/documento/dni — el cliente sube su DNI para completar los «datos para contratar» (§4bis).
 * Viaja por el mismo puente que la póliza declarada y queda en SU ficha como documento `dni`
 * RECIBIDO: Alberto lo revisa y, con él delante, es cuando se escriben DNI y fecha de nacimiento
 * (la identidad no se teclea: se acredita con el documento). El tipo va fijo; la ficha sale del
 * vínculo en asegura, nunca del cuerpo. 🚨 La vista de corredor no sube nada por el cliente (403).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) {
    return NextResponse.json({ estado: 'no_disponible', motivo: 'Estás viendo el portal como el cliente: el DNI lo sube él.' }, { status: 403 })
  }
  const tope = rateLimit(`dni:${identidad.id}`, 6, 60 * 60 * 1000)
  if (!tope.allowed) return NextResponse.json({ estado: 'espera', segundos: tope.retryAfter ?? 60 }, { status: 429 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ estado: 'invalido', motivo: 'No se ha podido leer el fichero.' }, { status: 400 })
  }
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ estado: 'invalido', motivo: 'Elige una foto o un PDF de tu DNI.' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ estado: 'invalido', motivo: 'El fichero pasa de 10 MB.' }, { status: 413 })

  const r = await guardarDocumentoPropio(identidad.id, {
    tipo: 'dni',
    nombre: fichero.name,
    mime: fichero.type,
    contenido: Buffer.from(await fichero.arrayBuffer()),
  })
  if (r.estado === 'ok') return NextResponse.json({ estado: 'ok' })
  if (r.estado === 'invalido') return NextResponse.json({ estado: 'invalido', motivo: 'Solo se admiten fotos (JPG, PNG) o PDF.' }, { status: 415 })
  if (r.estado === 'sin_ficha' || r.estado === 'varias_fichas') {
    return NextResponse.json({ estado: 'no_disponible', motivo: 'No podemos colgarlo de tu ficha desde aquí. Escríbenos y lo hacemos contigo.' }, { status: 409 })
  }
  // sin_puente o error: no sabemos si llegó.
  return NextResponse.json({ estado: 'error' }, { status: 503 })
}
