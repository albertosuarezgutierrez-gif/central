// /api/internal/gsc — Search Console A DEMANDA (la otra mitad del cron de los lunes).
//
// El cron `/api/cron/seo-correduria` lee SIEMPRE lo mismo (7 días cerrados, `query` + `page`,
// `sc-domain:grupoasegura.es`) y lo guarda en `seo_correduria_semana`. Esto sirve la pregunta
// suelta —otro rango, otras dimensiones, otra propiedad— sin sacar la clave privada de Vercel ni
// montar un servidor MCP de terceros con la credencial de Google delante. Misma cuenta de servicio
// (`GSC_SA_CLIENT_EMAIL`/`GSC_SA_PRIVATE_KEY`) y mismo scope de SOLO LECTURA.
//
//   GET  /api/internal/gsc            → propiedades a las que llega la cuenta de servicio
//   POST /api/internal/gsc            → { propiedad?, desde?, hasta?, dimensiones?, limite? }
//
// 🚨 Tri-estado, como el cron: falta el secreto → 503 `no_configurado`; Google falla → 502 `error`.
// NUNCA un 200 con la lista vacía, que aguas arriba se lee como «no hay tráfico». Y una ventana que
// toque los últimos 3 días sale con `parcial: true` + `ultimoDiaFiable`: GSC aún no los ha
// consolidado y el total es un suelo, no el dato.
//
// Auth: `isRoutineAuthorized` (ALERTA_TOKEN de bajo privilegio o CRON_SECRET), igual que
// `/api/internal/seo-correduria/semana`. Solo lectura y sin PII: posiciones, clics e impresiones
// agregados de páginas públicas — nada de la cartera ni de un cliente.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { tokenCuentaServicio } from '@/lib/seo-correduria/google-sa'
import {
  consultarLibre,
  esParcial,
  listarSitios,
  parsearConsulta,
  ultimoDiaFiable,
} from '@/lib/seo-correduria/gsc-consulta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const SECRETOS = ['GSC_SA_CLIENT_EMAIL', 'GSC_SA_PRIVATE_KEY'] as const

const f = fetch as (input: string, init?: RequestInit) => Promise<Response>

/** Token de la cuenta de servicio, o `null` + la lista de secretos que faltan. */
async function token(): Promise<{ token: string } | { faltan: string[] }> {
  const faltan = SECRETOS.filter(n => !process.env[n]?.trim())
  if (faltan.length) return { faltan }
  return {
    token: await tokenCuentaServicio(
      { clientEmail: process.env.GSC_SA_CLIENT_EMAIL!, privateKey: process.env.GSC_SA_PRIVATE_KEY!, scope: SCOPE },
      f,
    ),
  }
}

function noConfigurado(faltan: string[]) {
  return NextResponse.json(
    { ok: false, estado: 'no_configurado', detalle: `falta ${faltan.join(' y ')}` },
    { status: 503 },
  )
}

function fallo(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return NextResponse.json({ ok: false, estado: 'error', detalle: msg.slice(0, 300) }, { status: 502 })
}

export async function GET(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  try {
    const t = await token()
    if ('faltan' in t) return noConfigurado(t.faltan)
    const sitios = await listarSitios(t.token, f)
    return NextResponse.json({ ok: true, estado: 'ok', sitios })
  } catch (e) {
    return fallo(e)
  }
}

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const hoy = new Date()
  // Cuerpo VACÍO = «dame el defecto» (28 días por consulta). Cuerpo con bytes que no son JSON =
  // 400: tragárselo y responder el defecto le haría creer al caller que está viendo el rango que
  // pidió. Por eso no vale `req.json().catch(() => null)`, que confunde los dos casos.
  const crudo = await req.text()
  let body: unknown = null
  if (crudo.trim()) {
    try {
      body = JSON.parse(crudo)
    } catch {
      return NextResponse.json({ ok: false, estado: 'error', detalle: 'el cuerpo no es JSON válido' }, { status: 400 })
    }
  }
  const parseo = parsearConsulta(body, hoy)
  // 400 antes de pedir el token: un cuerpo inválido no gasta un round-trip a Google.
  if (!parseo.ok) return NextResponse.json({ ok: false, estado: 'error', detalle: parseo.error }, { status: 400 })
  const { consulta } = parseo

  try {
    const t = await token()
    if ('faltan' in t) return noConfigurado(t.faltan)
    const filas = await consultarLibre(t.token, consulta, f)
    return NextResponse.json({
      ok: true,
      estado: 'ok',
      consulta,
      parcial: esParcial(consulta, hoy),
      ultimoDiaFiable: ultimoDiaFiable(hoy),
      filas,
    })
  } catch (e) {
    return fallo(e)
  }
}
