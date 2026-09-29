import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { cuentaDeFicha, ponerCuentaFicha } from '@/lib/cambio-cuenta'

export const dynamic = 'force-dynamic'

// La cuenta de cargo de la FICHA (29/09/2026), la que usan la emisión y el bot de Telegram.
//
// GET ?id=  → { estado:'ok', mascara: '**** 0115' | null, ilegible }  (nunca el IBAN entero)
// PUT { id, iban, actor } → 200 ok {mascara} · 200 sin_cambios · 422 iban_invalido · 404 no_encontrado
//
// Solo la ficha: las pólizas vigentes conservan su cuenta (ver `ponerCuentaFicha`).

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
    if (!UUID.test(id)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
    const r = await cuentaDeFicha(correduria.id, id)
    return NextResponse.json(r, { status: r.estado === 'no_encontrado' ? 404 : 200 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/cuenta', e) }, { status: 500 })
  }
}

export const PUT = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    if (!UUID.test(id)) return NextResponse.json({ estado: 'invalido', motivo: 'Falta el id del cliente.' }, { status: 422 })
    const actor = typeof body?.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim().slice(0, 120) : 'plataforma'
    const r = await ponerCuentaFicha(correduria.id, id, body?.iban, actor)
    const status = r.estado === 'iban_invalido' ? 422 : r.estado === 'no_encontrado' ? 404 : 200
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cliente/cuenta', e) }, { status: 500 })
  }
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
