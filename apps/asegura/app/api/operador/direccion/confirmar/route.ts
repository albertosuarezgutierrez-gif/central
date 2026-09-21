import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { confirmarDireccion } from '@/lib/direccion/confirmar'
import { provinciaPorCp } from '@central/module-seguros'

/**
 * `GET /api/operador/direccion/confirmar?direccion=&codigoPostal=&municipio=`
 * — confirmación GRATIS de una dirección recién tecleada contra el callejero
 * oficial del Catastro, para el alta/edición de clientes en plataforma. No
 * toca la cartera, no gasta nada, no escribe nada: solo pregunta a un
 * servicio público y devuelve lo que ese servicio CONFIRMA.
 *
 * La provincia se deriva del CP (nunca se pide a la pantalla ni se lee de
 * ninguna ficha: son solo el texto de un formulario todavía sin guardar).
 * Sin CP y sin municipio no hay con qué acotar la pregunta al callejero
 * («Sierpes» sin municipio son cientos de calles en toda España) y se
 * responde `sin_lugar` — no es un fallo, es que faltan los dos primero.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = new URL(req.url)
  const direccion = url.searchParams.get('direccion')
  const codigoPostal = url.searchParams.get('codigoPostal')
  const municipio = url.searchParams.get('municipio')

  const provincia = codigoPostal ? provinciaPorCp(codigoPostal) : null
  const r = await confirmarDireccion(direccion, provincia, municipio && municipio.trim() !== '' ? municipio : null)

  return NextResponse.json(r, { status: 200 })
}
