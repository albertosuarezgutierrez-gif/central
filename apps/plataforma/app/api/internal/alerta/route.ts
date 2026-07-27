// /api/internal/alerta — Puerta de notificación Telegram para rutinas de Claude Code.
// Las rutinas efímeras NO tienen TELEGRAM_BOT_TOKEN propio; llaman aquí para avisar.
//
// Auth (basta con UNO):
//   1. Bearer = ALERTA_TOKEN — token DEDICADO y de bajo privilegio, que SOLO abre este
//      endpoint. Es el que se pone en el prompt de las rutinas: si se filtra, lo único que
//      permite es mandar un Telegram (no aplicar precios ni pegar a otros crons). **Header-only
//      (sin `?secret=`)**: como es el token que viaja en prompts, no lo dejamos ir por la URL
//      (query strings se filtran por logs de acceso / Referer). Las rutinas ya lo mandan por cabecera.
//   2. Bearer/?secret = CRON_SECRET — el Bearer maestro de todos los crons (compatibilidad
//      hacia atrás mientras se migran los prompts; conviene NO usarlo aquí a futuro).
//
// GET  = preflight: la rutina comprueba SU token AL ARRANCAR (`{ok:true}`), no al final, cuando ya
//        tiene algo que contar y descubrir el fallo no le sirve de nada. Ver `docs/AVISOS-AGENTES.md`.
// POST { text: string, html?: boolean } = mandar el aviso.
//
// ── POR QUÉ ESTE ENDPOINT SE CHIVA DE SUS PROPIOS 401 (incidente 26-27/07/2026) ──
// El fallo de este camino es AUTO-ANULANTE: el canal que se rompe ES el canal de aviso, así que
// cuando el token se desincroniza el agente no tiene cómo decir que no puede decir nada. Pasó dos
// veces seguidas (agentes-entrenador 26/07, buscador-ia 27/07) y se supo días después leyendo los
// commits a mano. El servidor SÍ tiene `TELEGRAM_BOT_TOKEN`, así que un 401 aquí avisa a Alberto por
// Telegram directamente: el token roto se delata solo, al primer intento.
// SEGURIDAD: ese aviso es de TEXTO FIJO — nunca incluye el cuerpo de la petición, que en un 401 no
// está autenticado y sería un vector para empujar texto arbitrario al Telegram de Alberto.
import { NextRequest, NextResponse } from 'next/server'
import { isAlertaTokenAuthorized, isCronAuthorized } from '@/lib/cron-auth'
import { tgSend } from '@central/core-telegram'

export const dynamic = 'force-dynamic'

type Diagnostico = { ok: boolean; causa?: string; remedio?: string }

/** Autoriza y, si no, dice EN CUÁL de las tres formas ha fallado (sin revelar ningún valor). */
function diagnosticar(req: NextRequest): Diagnostico {
  if (isAlertaTokenAuthorized(req) || isCronAuthorized(req)) return { ok: true }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!bearer) {
    return {
      ok: false,
      causa: 'sin cabecera Authorization',
      remedio: 'Manda `Authorization: Bearer <ALERTA_TOKEN>`. Si esa variable no está en el entorno ' +
        'de la rutina, no la inventes: usa la vía alternativa de docs/AVISOS-AGENTES.md.',
    }
  }
  if (!process.env.ALERTA_TOKEN) {
    return {
      ok: false,
      causa: 'el servidor no tiene ALERTA_TOKEN configurado',
      remedio: 'Ponla en el proyecto Vercel `plataforma` y REDESPLIEGA (las envs de Vercel no entran ' +
        'en runtime sin redeploy). Desde /operador/secretos el redeploy es automático.',
    }
  }
  return {
    ok: false,
    causa: 'el token no coincide con el de Vercel plataforma',
    remedio: 'ALERTA_TOKEN está duplicado a mano en Vercel y en el campo de variables de CADA entorno ' +
      'de Claude Code: este entorno lleva un valor viejo. Pega el mismo valor en ambos (byte a byte) ' +
      'y redespliega plataforma. Ver docs/AVISOS-AGENTES.md.',
  }
}

// Anti-spam del chivatazo. Vive en memoria del contenedor: en serverless cada instancia lleva el
// suyo, así que un brote puede colar algún duplicado — asumido a propósito, porque la alternativa
// (persistirlo) mete una escritura a BD en el camino de una petición NO autenticada.
let ultimoChivatazo = 0
const CHIVATAZO_MS = 6 * 60 * 60 * 1000

async function chivarse(req: NextRequest, causa: string) {
  // Solo si venía un Bearer: una petición SIN token no es una rutina rota, es ruido de internet.
  if (!req.headers.get('authorization')) return
  const ahora = Date.now()
  if (ahora - ultimoChivatazo < CHIVATAZO_MS) return
  ultimoChivatazo = ahora
  await tgSend(
    '🔇⚠️ <b>Un agente no ha podido avisarte</b>\n\n' +
      `Una rutina llamó a <code>/api/internal/alerta</code> y fue rechazada: ${causa}.\n\n` +
      'Mientras siga así, los avisos Telegram de TODOS los agentes están mudos. Resincroniza ' +
      '<code>ALERTA_TOKEN</code> (mismo valor en Vercel <i>plataforma</i> y en el entorno de la ' +
      'rutina) y redespliega — desde <code>/operador/secretos</code> el redeploy va solo.',
    { html: true },
  )
}

/** Preflight: la rutina valida su token al arrancar, no cuando ya tiene algo que contar. */
export async function GET(req: NextRequest) {
  const d = diagnosticar(req)
  if (d.ok) return NextResponse.json({ ok: true })
  await chivarse(req, d.causa!)
  return NextResponse.json(
    { ok: false, error: 'No autorizado', causa: d.causa, remedio: d.remedio },
    { status: 401 },
  )
}

export async function POST(req: NextRequest) {
  const d = diagnosticar(req)
  if (!d.ok) {
    await chivarse(req, d.causa!)
    return NextResponse.json(
      { error: 'No autorizado', causa: d.causa, remedio: d.remedio },
      { status: 401 },
    )
  }
  const body = await req.json().catch(() => null)
  if (!body?.text || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'text requerido' }, { status: 400 })
  }
  const messageId = await tgSend(body.text, { html: body.html !== false })
  return NextResponse.json({ ok: true, messageId })
}
