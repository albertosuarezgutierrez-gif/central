import { NextResponse } from 'next/server'
import { z } from 'zod'

import { TIPOS_RELACION } from '@central/module-seguros'
import {
  ALCANCES_INVITACION,
  MAX_MENSAJE_INVITACION,
  MAX_NOMBRE_INVITADO,
} from '@central/module-seguros-portal'

import { crearInvitacion, invitacionesDeSesion, type MotivoNoEnviada } from '@/lib/invitaciones'
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
  // El vocabulario lo fija el módulo puro: mirar (`ver`, `ver_economico`) o
  // NADA (`ninguno`, «solo le presento el portal»). Apoderar, nunca.
  alcance: z.enum(ALCANCES_INVITACION as unknown as [string, ...string[]]),
  // 08/09/2026, «Contactos»: cómo se llama y qué es de quien invita. Los dos
  // obligatorios desde la pantalla — sin ellos la lista de José vuelve a ser
  // una lista de fechas. La relación, con el vocabulario de la cartera.
  invitadoNombre: z.string().trim().min(1).max(MAX_NOMBRE_INVITADO),
  relacion: z.enum(TIPOS_RELACION as unknown as [string, ...string[]]),
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
    invitadoNombre: parsed.data.invitadoNombre,
    relacion: parsed.data.relacion,
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

/**
 * Lo que ESTA identidad ha invitado y lo que le han invitado a ella.
 *
 * 🚨 Sin `try/catch`: si la consulta falla, que suba como error. Devolver
 * `{ enviadas: [], recibidas: [] }` haría pasar un fallo de BD por «no has
 * invitado a nadie», que es exactamente la mentira que la regla de la casa
 * persigue — y encima sobre la lista donde José decide si retira algo.
 *
 * La identidad la resuelve `invitacionesDeSesion()` desde la cookie, nunca la
 * URL: aquí no hay ni un parámetro que pudiera decir de quién son estas
 * invitaciones.
 */
export async function GET() {
  const datos = await invitacionesDeSesion()
  if (datos === null) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  return NextResponse.json(datos)
}
