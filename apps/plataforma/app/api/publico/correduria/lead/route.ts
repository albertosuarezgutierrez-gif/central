import { NextRequest, NextResponse } from 'next/server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { altaClienteAsegura, historialClienteAsegura, interpretarEscritura } from '@/lib/cliente-edicion-asegura'
import {
  interpretarAltaLead,
  notasAlta,
  revisarLeadWeb,
  textoHistorialContacto,
  textoTelegramLead,
  MOTIVO_BOT,
  type FichaLead,
} from '@/lib/leads-web'
import { tgAviso } from '@/lib/telegram/avisos'

export const dynamic = 'force-dynamic'

// POST /api/publico/correduria/lead — el formulario público de `/seguros`.
//
// SIN sesión (está bajo `/api/publico` en el middleware). Lo que le frena:
// rate limit 6/h por IP (best-effort, por instancia) y el honeypot `web`, que
// responde 200 «recibido» sin hacer nada (al bot no se le dice que se le vio).
//
// Con datos válidos, SIEMPRE pasan dos cosas: se intenta registrar el lead en
// la cartera por el puerto de asegura, y se avisa a Alberto por Telegram. Lo
// segundo NO depende de lo primero: si el puerto está caído, el aviso lleva
// los datos del formulario y dice que no hay ficha — ese Telegram es entonces
// el único rastro del lead, y por eso se manda antes de responder.
//
// Tres estados internos (ficha nueva · ficha que ya existía · no registrado);
// al usuario se le responde `{ok:true}` en los dos primeros sin distinguirlos
// (no se le revela si ya estaba en la cartera) y 502 en el tercero.
//
// Nunca se fuerza un duplicado desde aquí: si el teléfono/email ya está en una
// ficha (409 forzable), el contacto se anota en ESA ficha, tipo `contacto`.
// Ningún dato personal pasa por `console.*`.
export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (!rateLimit(`lead-web:${ip}`, 6, 60 * 60 * 1000).allowed) {
    return NextResponse.json({ ok: false, motivo: 'Demasiadas solicitudes desde esta conexión. Inténtalo más tarde o llámanos.' }, { status: 429 })
  }
  const body = await req.json().catch(() => null)
  const r = revisarLeadWeb(body)
  if (!r.ok) {
    if (r.motivo === MOTIVO_BOT) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, motivo: r.motivo, campo: r.campo ?? null }, { status: 422 })
  }
  const lead = r.lead

  const alta = await altaClienteAsegura({
    nombre: lead.nombre,
    apellidos: lead.apellidos,
    telefono: lead.telefono,
    email: lead.email,
    notas: notasAlta(lead),
    fuente: 'web',
    actor: 'web',
  })
  const resultado = interpretarAltaLead(interpretarEscritura(alta.status, alta.json))

  let ficha: FichaLead = null
  let motivo: string | undefined
  if (resultado.estado === 'nueva') {
    ficha = { id: resultado.id, nueva: true, nombre: `${lead.nombre}${lead.apellidos ? ` ${lead.apellidos}` : ''}` }
  } else if (resultado.estado === 'existente') {
    ficha = { id: resultado.id, nueva: false, nombre: resultado.nombre }
    // El contacto se anota en la ficha que ya existía. Si no se puede, se dice en el aviso:
    // un historial que no ha quedado no se da por anotado.
    const h = await historialClienteAsegura({ clienteId: resultado.id, tipo: 'contacto', texto: textoHistorialContacto(lead) })
    const hr = interpretarEscritura(h.status, h.json)
    if (hr.estado !== 'ok') motivo = `contacto NO anotado en su historial (${hr.estado === 'error' ? hr.motivo : hr.estado})`
  } else {
    motivo = resultado.motivo
  }

  const aviso = textoTelegramLead({ ...lead, ficha, motivo })
  if (resultado.estado === 'existente' && motivo) {
    // `ficha` presente pero con aviso de historial fallido: se añade al texto.
    await tgAviso('correduria.lead-nuevo', `${aviso}\n⚠️ ${motivo}`).catch(() => {})
  } else {
    await tgAviso('correduria.lead-nuevo', aviso).catch(() => {})
  }

  if (resultado.estado === 'rechazado') {
    return NextResponse.json({ ok: false, motivo: `No hemos podido registrar la solicitud: ${resultado.motivo}.` }, { status: 422 })
  }
  if (resultado.estado === 'no_registrado') {
    return NextResponse.json({ ok: false, motivo: 'Ahora mismo no podemos registrar la solicitud. Inténtalo en unos minutos o llámanos.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
