import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { descifrarCampo } from '@/lib/cartera-edicion'

export const dynamic = 'force-dynamic'

// POST /api/operador/cliente/dni — el DNI COMPLETO, sin enmascarar.
//
// 🚨 Es la ÚNICA salida del puerto que deja cruzar el documento entero. El resto
// del puerto (`/cliente`, `/impagados`…) lo enmascara a propósito («*****678Z»)
// porque para trabajar una renovación no hace falta y es justo el dato con el
// que se suplanta a alguien. Este endpoint existe para UN caso concreto: Alberto
// necesita copiar el DNI a la intranet de una compañía. Plataforma lo protege
// con un código de un solo uso por Telegram ANTES de llamar aquí — este puerto
// confía en ese gate y en el secreto de operador, como el resto del puerto.
//
// Cada llamada deja fila en `historial_interno`, en claro, con quién lo pidió:
// es la única forma de que una revelación se pueda auditar después.
export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : 'desconocido'
    if (id === '') return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })

    const cliente = await prismaAsegura().cliente.findFirst({
      where: { id, correduriaId: correduria.id },
      select: { id: true, dni: true },
    })
    if (!cliente) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })

    await anotar(correduria.id, cliente.id, `DNI completo revelado por ${actor} (copia para intranet de compañía).`)

    if (!cliente.dni) return NextResponse.json({ estado: 'sin_dni' })
    const dni = descifrarCampo(cliente.dni)
    if (dni === null) return NextResponse.json({ estado: 'ilegible' })
    return NextResponse.json({ estado: 'ok', dni })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/dni', e) }, { status: 500 })
  }
}

/** Best-effort: que el historial falle no bloquea la revelación, pero se grita. */
async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[operador/cliente/dni] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
