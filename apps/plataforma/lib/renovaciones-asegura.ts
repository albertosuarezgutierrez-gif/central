// apps/plataforma/lib/renovaciones-asegura.ts
//
// Registro de contacto de RENOVACIÓN — Alberto pulsó el botón de WhatsApp de
// un aviso «tu seguro vence pronto» sobre un cliente VIVO. Distinto de
// `recaptacion-asegura.ts` (leads muertos del volcado), pero mismo contrato
// de escritura, así que se reutiliza `EscrituraRecaptacion`/
// `interpretarEscrituraRecaptacion` en vez de duplicar los cinco estados.
import { interpretarEscrituraRecaptacion, type EscrituraRecaptacion } from './recaptacion-asegura'
import { cabecerasPuerto } from './puerto-actor.ts'

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedirCon(path: string, init: RequestInit, timeoutMs: number = 8000): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(await cabecerasPuerto(secret)), ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

/** Mismo desenlace que `enviarWhatsappRecaptacionAsegura`: registra que
 *  Alberto abrió el enlace, no que el cliente lo leyó (sin WABA no hay otra
 *  forma). El envío en sí lo hace su propio WhatsApp. */
export async function registrarContactoRenovacionAsegura(body: {
  clienteId: string
  polizaId: string
  mensaje: string
  actor: string
}): Promise<EscrituraRecaptacion> {
  try {
    const r = await pedirCon('/api/operador/renovaciones/contacto', { method: 'POST', body: JSON.stringify(body) })
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarEscrituraRecaptacion(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
