import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  ALCANCES_CONCEDIBLES,
  MAX_MENSAJE_PETICION,
  TEXTO_REGISTRADA,
  type RespuestaPublica,
} from '@central/module-seguros-portal'

import { crearPeticion, ipDe, userAgentDe } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * «Papá, ¿me dejas ver tu seguro del coche?» — pedirle acceso a otra persona.
 *
 * 🚨 ESTA RUTA NO PUEDE CONTESTAR SI ESA PERSONA ES CLIENTE. Quien pide nombra
 * al destinatario por su CORREO; si la respuesta distinguiera «no está con
 * nosotros» de «petición registrada», cualquiera podría recorrer una lista de
 * correos y sacar quién está en la cartera de Alberto — 32.600 fichas, desde
 * fuera y sin que nada falle.
 *
 * Por eso el cuerpo y el código HTTP salen de `respuestaPublica()` del módulo
 * puro, que colapsa `creada`, `sin_destinatario`, `ya_pendiente` y
 * `ya_autorizado` en un único `registrada`. **Nada de esta ruta mira el
 * `resultado` interno**, ni siquiera para un log: el día que alguien meta aquí
 * un `if` por resultado, el oráculo está abierto.
 */

/** Los tres textos, uno por respuesta pública. El de `registrada` se IMPORTA, no se reescribe. */
const TEXTO: Record<RespuestaPublica, string> = {
  // Fíjate en lo que NO dice: ni que exista esa persona, ni que le haya llegado
  // nada. Vive en el módulo para que no se escriba dos veces con matices
  // distintos — «no hemos encontrado a esa persona» en una pantalla reabre por
  // la puerta del copy lo que la respuesta cierra.
  registrada: TEXTO_REGISTRADA,
  // Estas dos SÍ se pueden decir: dependen solo de quien pregunta y no revelan
  // nada de nadie más.
  a_si_mismo: 'Ese correo es el tuyo: tus seguros ya los tienes en tu bóveda.',
  limite_diario: 'Has hecho ya varias peticiones hoy. Prueba de nuevo mañana.',
}

/**
 * El código HTTP de cada respuesta pública. Un mapa, no una cadena de `if`.
 *
 * `registrada` es un 202 —«lo hemos registrado», que es lo único cierto en los
 * cuatro casos que colapsa— y es el MISMO para los cuatro. Los otros dos códigos
 * pueden ser distintos porque hablan de quien pregunta, no del destinatario.
 */
const ESTADO_HTTP: Record<RespuestaPublica, number> = {
  registrada: 202,
  a_si_mismo: 400,
  limite_diario: 429,
}

const Entrada = z.object({
  // Solo la FORMA. Un correo mal escrito se rechaza por su forma, y eso no dice
  // nada de si esa dirección está o no en la cartera.
  email: z.string().trim().email().max(200),
  // El vocabulario lo fija el módulo puro: hoy solo se puede pedir MIRAR.
  alcance: z.enum(ALCANCES_CONCEDIBLES as unknown as [string, ...string[]]),
  // Se recorta y se normaliza en el módulo (`normalizarMensajePeticion`): aquí
  // solo se pone un tope generoso para no tragarse un cuerpo enorme.
  mensaje: z.string().max(MAX_MENSAJE_PETICION * 4).optional(),
})

export async function POST(req: Request) {
  // La identidad SIEMPRE sale de la cookie, nunca del cuerpo: quien pide es
  // quien tiene la sesión, y eso es lo que se guarda en la fila.
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  // 🚨 El correo entra aquí y NO sale de aquí: `crearPeticion` lo convierte en
  // su índice ciego y lo que se guarda es el hash. No se loguea, no se
  // devuelve, no se mete en ninguna cabecera.
  const r = await crearPeticion({
    identidadId: identidad.id,
    email: parsed.data.email,
    alcance: parsed.data.alcance,
    mensaje: parsed.data.mensaje,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    // `no_disponible` (503) es una avería nuestra (falta la clave del índice
    // ciego), no un «esa persona no está»: le pasa a TODO el mundo por igual.
    const estado = r.error === 'no_disponible' ? 503 : 400
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: estado })
  }

  // 🚨 El cuerpo se monta con `r.respuesta`, JAMÁS con `r.resultado`. Y no lleva
  // el id de la fila a propósito: cualquier asimetría —un id que a veces está y
  // a veces no— es otra forma de contestar la pregunta que esta ruta no puede
  // contestar.
  return NextResponse.json(
    { respuesta: r.respuesta, texto: TEXTO[r.respuesta] },
    { status: ESTADO_HTTP[r.respuesta] },
  )
}
