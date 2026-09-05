import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { clientesSinCanal } from '@/lib/clientes-sin-canal'

export const dynamic = 'force-dynamic'

// GET /api/operador/sin-canal — clientes de la cartera VIVA (los que entran por
// CIMA) a los que no se les puede escribir ni llamar. Read-only: esta ruta no
// envía nada a nadie, solo dice a quién no se puede avisar.
//
// A diferencia de `/api/operador/impagados`, aquí NO viaja ni un teléfono ni un
// correo: el grupo que encabeza la lista es justamente el que no tiene ninguno
// de los dos, así que mandarlos solo expondría PII de los demás sin que la
// pantalla lo necesite. Para ver el contacto de alguien está su ficha.
//
// Sí viajan NOMBRES: el del cliente (hace falta para saber a quién llamar) y,
// desde el 04/09/2026, el de las FICHAS de quien esté en su póliza y sí sea
// localizable —sin eso la pantalla decía «ilocalizable» de gente con la que se
// habla todos los años—. El nombre de un interviniente suelto va cifrado y NO se
// manda: de esos solo el recuento.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    return NextResponse.json({ estado: 'ok', ...(await clientesSinCanal(correduria.id)) })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/sin-canal', e) })
  }
}
