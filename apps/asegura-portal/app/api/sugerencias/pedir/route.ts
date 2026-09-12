import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ALCANCES_CONCEDIBLES, MAX_MENSAJE_PETICION, TEXTO_REGISTRADA, type RespuestaPublica } from '@central/module-seguros-portal'

import { ipDe, peticionDesdeRelacion, userAgentDe } from '@/lib/peticiones'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * «Pedir acceso» a partir de una sugerencia YA calculada por
 * `GET /api/sugerencias` — no a un correo escrito a mano.
 *
 * 🚨 Aquí NO hace falta el oráculo de `/api/peticiones`: la pantalla no manda
 * un correo cualquiera, manda un `clienteId` que salió de una relación real
 * (`cliente_relaciones`) sobre una ficha propia — algo que ya sabíamos, no
 * algo que se está probando. Aun así se reutiliza `respuestaPublica()` porque
 * el resultado interno (creada/ya_pendiente/ya_autorizado…) sigue siendo el
 * mismo vocabulario que `crearPeticion()`, y `peticionDesdeRelacion()` vuelve
 * a comprobar la relación real contra la BD antes de escribir nada — ver
 * `lib/peticiones.ts`.
 */

const TEXTO: Record<RespuestaPublica, string> = {
  registrada: TEXTO_REGISTRADA,
  a_si_mismo: 'Esa ficha es la tuya: tus seguros ya los tienes en tu bóveda.',
  limite_diario: 'Has hecho ya varias peticiones hoy. Prueba de nuevo mañana.',
}

const ESTADO_HTTP: Record<RespuestaPublica, number> = {
  registrada: 202,
  a_si_mismo: 400,
  limite_diario: 429,
}

const Entrada = z.object({
  relacionadoClienteId: z.string().uuid(),
  alcance: z.enum(ALCANCES_CONCEDIBLES as unknown as [string, ...string[]]),
  mensaje: z.string().max(MAX_MENSAJE_PETICION * 4).optional(),
})

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const r = await peticionDesdeRelacion({
    identidadId: identidad.id,
    relacionadoClienteId: parsed.data.relacionadoClienteId,
    alcance: parsed.data.alcance,
    mensaje: parsed.data.mensaje,
    ip: ipDe(req),
    userAgent: userAgentDe(req),
  })

  if (!r.ok) {
    // `sin_hash` es un caso propio de esta vía (la ficha sugerida no tiene
    // correo cargado): no es un 503 de avería nuestra, así que se distingue.
    const estado = r.error === 'no_disponible' ? 503 : r.error === 'sin_hash' ? 409 : 400
    return NextResponse.json({ error: r.error, mensaje: r.mensaje }, { status: estado })
  }

  return NextResponse.json({ respuesta: r.respuesta, texto: TEXTO[r.respuesta] }, { status: ESTADO_HTTP[r.respuesta] })
}
