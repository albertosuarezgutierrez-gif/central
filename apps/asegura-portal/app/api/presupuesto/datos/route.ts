import { NextResponse } from 'next/server'
import { tgSend } from '@central/core-telegram'

import { reportarDatosIncorrectos } from '@/lib/presupuesto-firma'
import { accesoPuenteDe } from '@/lib/presupuesto'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/presupuesto/datos — «Hay un dato que no es correcto» en «Revisa tus datos».
 *   { presupuestoId, texto } → queda en el historial de su ficha y avisa a Alberto por Telegram.
 *
 * Con el aviso dado, la aceptación de ESE presupuesto queda cerrada desde el portal (lo decide
 * asegura): los datos del precio están congelados en su tarificación y corregirlos es retarificar.
 * Quién avisa sale de la SESIÓN o del acceso por WhatsApp de ESTE presupuesto (`accesoPuenteDe`);
 * la vista de corredor no escribe como el cliente (403).
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
  const texto = typeof b?.texto === 'string' ? b.texto.trim() : ''
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'no_disponible', motivo: 'Faltan datos.' }, { status: 422 })
  const puerta = await accesoPuenteDe(presupuestoId)
  if (!puerta) return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  if (puerta.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })
  if (texto.length < 3) return NextResponse.json({ estado: 'reintentar', motivo: 'Cuéntanos en unas palabras qué dato no es correcto.' }, { status: 422 })

  const r = await reportarDatosIncorrectos(puerta.acceso, presupuestoId, texto.slice(0, 1000))
  if (r.estado === 'ok') {
    // Best-effort, como el aviso de aceptación: el registro de verdad ya está en su ficha.
    try {
      const id = await tgSend(r.aviso ?? `⚠️ Un cliente dice que un dato de su presupuesto (${presupuestoId.slice(0, 8)}) no es correcto. Llámale.`)
      if (!id) console.warn('[presupuesto/datos] Telegram sin canal o no salió: el aviso del dato incorrecto no ha llegado')
    } catch (e) {
      console.warn('[presupuesto/datos] no se pudo avisar por Telegram:', e instanceof Error ? e.message : e)
    }
    return NextResponse.json({ estado: 'ok' }, { status: 200 })
  }
  const status = r.estado === 'reintentar' ? 422 : r.estado === 'no_disponible' ? 409 : 502
  return NextResponse.json(r, { status })
}
