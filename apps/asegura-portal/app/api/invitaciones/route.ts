import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ALCANCES_CONCEDIBLES, MAX_MENSAJE_INVITACION } from '@central/module-seguros-portal'

import { crearInvitacion, type MotivoNoEnviada } from '@/lib/invitaciones'
import { ipDe, userAgentDe } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * «Te invito a ver mis seguros»: José abre su ficha a un correo escrito a mano.
 *
 * 🚨 Esta ruta recibe el correo de un TERCERO en claro y **no lo devuelve, no lo
 * loguea y no lo guarda**: `crearInvitacion` lo convierte en su hash. Lo único
 * que sale de aquí es qué pasó.
 *
 * 🚨 Y el token del enlace **no aparece en la respuesta**. Viaja solo dentro del
 * correo: devolvérselo a quien invita convertiría el enlace en algo que se puede
 * copiar y pegar por WhatsApp, y entonces la invitación dejaría de estar atada
 * al buzón del invitado, que es lo único que la protege.
 */

/** El código HTTP de cada motivo. Un mapa, no una cadena de `if`. */
const ESTADO_HTTP: Record<MotivoNoEnviada, number> = {
  // 🚨 502 y 503 dicen cosas OPUESTAS sobre la BD y por eso están separados:
  //  · `envio_fallido` (502) = la invitación EXISTE y lo que falló fue avisar.
  //    Decir «no se ha invitado» sería mentir, y el segundo intento chocaría
  //    con el índice único.
  //  · `sin_enlace` (503) = no hay dominio configurado, así que la fila NO se
  //    ha escrito. Es una avería nuestra, igual para todo el mundo.
  envio_fallido: 502,
  sin_enlace: 503,
  ya_invitado: 409,
  ya_autorizado: 409,
  poliza_no_es_tuya: 409,
  a_si_mismo: 400,
  datos_invalidos: 400,
  limite_diario: 429,
  ficha_no_tuya: 403,
  nivel_insuficiente: 403,
}

const Entrada = z.object({
  // La ficha DESDE la que se invita. No se fía de esto: `crearInvitacion` la
  // comprueba contra `portal_vinculo` filtrado por la identidad de la cookie.
  otorganteClienteId: z.string().uuid(),
  // El vocabulario lo fija el módulo puro: por invitación solo se ofrece MIRAR.
  alcance: z.enum(ALCANCES_CONCEDIBLES as unknown as [string, ...string[]]),
  // Ausente = todas las pólizas de la ficha, futuras incluidas.
  polizaId: z.string().uuid().optional(),
  // Solo la FORMA del correo. Que exista o no esa dirección no lo dice nadie.
  email: z.string().trim().email().max(200),
  // Se recorta y se normaliza en el módulo (`normalizarMensajeInvitacion`);
  // aquí solo se pone un tope generoso para no tragarse un cuerpo enorme.
  mensaje: z.string().max(MAX_MENSAJE_INVITACION * 4).optional(),
})

export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo: quien invita es
  // quien tiene la sesión, y eso es lo que se guarda en la fila.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const r = await crearInvitacion({
    identidadId: identidad.id,
    otorganteClienteId: parsed.data.otorganteClienteId,
    alcance: parsed.data.alcance,
    polizaId: parsed.data.polizaId,
    email: parsed.data.email,
    mensaje: parsed.data.mensaje,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    // `registrada` viaja para que la pantalla pueda decir «la invitación está
    // hecha, lo que ha fallado es el aviso» en vez de invitar a reintentar algo
    // que chocaría con el índice único. El `mensaje` va siempre: un 409 sin su
    // razón deja a la persona sin saber si el problema es suyo o nuestro.
    return NextResponse.json(
      { error: r.error, mensaje: r.mensaje, registrada: r.registrada },
      { status: ESTADO_HTTP[r.error] },
    )
  }

  // 201: la invitación se ha creado Y el correo ha salido. Sin el id de la fila
  // ni el token: la pantalla recarga su lista, que es de donde salen los ids.
  return NextResponse.json({ resultado: 'enviada' }, { status: 201 })
}
