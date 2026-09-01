import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { fichaCliente } from '@/lib/cartera-ficha'

export const dynamic = 'force-dynamic'

// GET /api/operador/cliente?id=<uuid> — la ficha completa de un cliente.
//
// Es lo que hay detrás del «pincho en el nombre y lo tengo todo»: pólizas,
// recibos y siniestros de una vez, para que la pantalla de plataforma no tenga
// que encadenar tres llamadas.
//
// 🔒 Lo que NO cruza este puerto, a propósito: **DNI, IBAN y dirección**. Para
// trabajar una renovación no hacen falta, y son justo los datos con los que se
// suplanta a alguien. Se ven en asegura, en la pantalla de retarificar, que es
// donde de verdad se usan. El teléfono y el email sí viajan: sin ellos no se
// puede llamar a nadie, que es el propósito entero de la ficha.
//
// Los cuatro estados son los de siempre: `sin_configurar` (el puerto no está
// conectado) · `error` (no se ha podido mirar) · `no_encontrado` (se miró y no
// está) · `ok`. Colapsar los dos primeros en «no existe» sería decir que un
// cliente no está cuando lo que pasa es que no se ha podido consultar.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' })
    const ficha = await fichaCliente(correduria.id, id)
    if (!ficha) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ficha })
  } catch {
    return NextResponse.json({ estado: 'error' })
  }
}
