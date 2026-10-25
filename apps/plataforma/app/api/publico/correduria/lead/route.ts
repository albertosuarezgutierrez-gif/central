import { NextRequest, NextResponse } from 'next/server'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { altaClienteAsegura, historialClienteAsegura, interpretarEscritura } from '@/lib/cliente-edicion-asegura'
import { solicitudLeadWebAsegura } from '@/lib/seguimiento-asegura'
import {
  cuerpoAltaLead,
  lineaConsentimientoContacto,
  interpretarAltaLead,
  interpretarEnlaceDatos,
  ramoEnlaceDatos,
  type EnlaceDatos,
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
// ficha (409 forzable), el contacto se anota en ESA ficha, tipo `contacto`, y
// (25/10/2026) se le abre la oportunidad del ramo con su enlace a ciegas.
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
  // Hora del SERVIDOR: es la fecha del consentimiento que se guarda (nunca la del navegador).
  const ahora = new Date()

  // Prueba del consentimiento (versión, fecha, finalidad, comerciales, IP /24) y atribución
  // first-touch viajan con el alta; asegura guarda la prueba en `seguros.consent_logs` y la
  // atribución en `historial_interno` (al anonimizar la ficha, la purga RGPD de asegura redacta el
  // texto de esas líneas en la misma sentencia; `consent_logs` es append-only y no se toca).
  const alta = await altaClienteAsegura(cuerpoAltaLead(lead, { ahora, ip: ip === 'unknown' ? null : ip }))
  const resultado = interpretarAltaLead(interpretarEscritura(alta.status, alta.json))

  let ficha: FichaLead = null
  let motivo: string | undefined
  if (resultado.estado === 'nueva') {
    ficha = { id: resultado.id, nueva: true, nombre: `${lead.nombre}${lead.apellidos ? ` ${lead.apellidos}` : ''}` }
  } else if (resultado.estado === 'existente') {
    ficha = { id: resultado.id, nueva: false, nombre: resultado.nombre }
    // El contacto se anota en la ficha que ya existía. Si no se puede, se dice en el aviso:
    // un historial que no ha quedado no se da por anotado.
    const h = await historialClienteAsegura({ clienteId: resultado.id, tipo: 'contacto', texto: `${textoHistorialContacto(lead)} · ${lineaConsentimientoContacto(lead, ahora)}` })
    const hr = interpretarEscritura(h.status, h.json)
    if (hr.estado !== 'ok') motivo = `contacto NO anotado en su historial (${hr.estado === 'error' ? hr.motivo : hr.estado})`
  } else {
    motivo = resultado.motivo
  }

  // Oportunidad + enlace al formulario de datos (06/10/2026 auto/moto con ficha nueva; 25/10/2026 TODOS los ramos y
  // también la ficha que ya existía, a ciegas: venta cruzada). FAIL-SOFT: el puerto tiene 8 s; cualquier fallo, tope,
  // SQL sin aplicar o respuesta rara = aviso con el texto de siempre.
  // La respuesta lleva el token en la URL: ni se loguea ni se guarda.
  let enlace: EnlaceDatos = { estado: 'sin_enlace' }
  const pedir = ramoEnlaceDatos(lead.tipoSeguro, resultado, lead.telefono)
  if (pedir && ficha) {
    // `llamar` no lanza: red, timeout o puerto caído vuelven como 502/503 → sin enlace.
    const s = await solicitudLeadWebAsegura({ clienteId: ficha.id, ramo: pedir.ramo, existente: pedir.existente })
    enlace = interpretarEnlaceDatos(s.status, s.json)
  }

  const aviso = textoTelegramLead({
    ...lead,
    ficha,
    motivo,
    urlDatos: enlace.estado === 'ok' ? enlace.url : null,
    topeLeadsWeb: enlace.estado === 'tope',
  })
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
