import { NextResponse } from 'next/server'

import { responderInvitacion, type ErrorResponder } from '@/lib/invitaciones'
import { ipDe, userAgentDe } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * El invitado acepta o rechaza, **ya dentro y con su propia sesión**.
 *
 * 🚨 Esta ruta EXIGE sesión, y esa es la decisión central del diseño: el token
 * dice QUÉ invitación es, nunca QUIÉN eres. Si aceptara solo con el token,
 * bastaría reenviar el correo —o leer un buzón compartido— para entrar en los
 * seguros de un tercero, y encima la aceptación constaría a nombre de «el que
 * tenía el enlace», que no es una prueba de consentimiento (art. 7.1 RGPD).
 *
 * 🚨 Y es un POST, no un GET: un enlace que consumiera la invitación con un GET
 * lo gastarían el antivirus del correo y el prefetch del cliente antes de que la
 * persona lo tocase. Es la misma lección que `lib/enlace-acceso.ts`.
 *
 * 🚨 `no_es_tu_correo` (403) no filtra nada: quien pregunta ya tiene el token en
 * la mano, así que sabe que la invitación existe. Lo que necesita saber es que
 * ha entrado con la cuenta equivocada — decirle «no encontrada» lo dejaría
 * reintentando con la misma cuenta para siempre.
 */
const ESTADO_HTTP: Record<ErrorResponder, number> = {
  datos_invalidos: 400,
  // Token que no existe, caducada y ya contestada, las tres iguales: para quien
  // llega desde el correo son «este enlace ya no sirve», y separarlas solo le
  // diría a quien prueba tokens cuáles ha acertado.
  no_encontrada: 404,
  no_es_tu_correo: 403,
}

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  let cuerpo: unknown
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  const c = (typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}) as Record<string, unknown>
  const accion = c.accion
  if (accion !== 'aceptar' && accion !== 'rechazar') {
    return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
  }

  // El token no se valida aquí: lo hace `normalizarTokenInvitacion()` del módulo
  // puro dentro de la capa de BD, y un token con mala forma sale por
  // `no_encontrada` como cualquier otro que no case. **No se loguea nunca.**
  const r = await responderInvitacion({
    identidadId: identidad.id,
    token: c.token,
    accion,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: ESTADO_HTTP[r.error] })
  }

  // `autorizacionId` es la costura entre las dos tablas: es lo que permite
  // enseñarle al invitado que aceptar sirvió para algo. `null` al rechazar.
  return NextResponse.json({ estado: r.estado, autorizacionId: r.autorizacionId })
}
