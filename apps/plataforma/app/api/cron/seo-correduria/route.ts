// Cron SEO de la correduría — lunes 08:30 UTC (registrado en lib/cron-dispatch.ts).
//
// Lee las tres fuentes que el agente `seo-asegura` necesitaba y hasta hoy le pegaba una persona:
//   - Google Search Console: por qué consultas aparece grupoasegura.es y con qué posición.
//   - Serper: quién ocupa el top-10 de cada consulta objetivo, y si estamos.
//   - PostHog EU: visitas medidas (solo quien consintió el banner).
// Guarda UNA fila por fuente y semana en `seo_correduria_semana` con TRI-ESTADO y manda a
// Telegram un informe con una sola acción propuesta (regla pura, sin LLM).
//
// 🚨 Un secreto que falta o una llamada que falla NO se pinta como cero: la fila lleva
// `estado = no_configurado | error` con el motivo, el informe lo dice tal cual y el latido sale
// con ok=false para que el vigía avise. Es la regla «dato que NO hay ≠ dato que NO se ha mirado».
// Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { tgAviso } from '@/lib/telegram'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import {
  DOMINIO_PROPIO,
  POSTHOG_API_HOST_DEFECTO,
  POSTHOG_PROJECT_ID_DEFECTO,
  PROPIEDAD_GSC,
  type Fuente,
  type ResultadoFuente,
  type Resultados,
} from '@/lib/seo-correduria/tipos'
import { CONSULTAS } from '@/lib/seo-correduria/consultas'
import { tokenCuentaServicio } from '@/lib/seo-correduria/google-sa'
import { leerGsc } from '@/lib/seo-correduria/gsc'
import { leerSerp } from '@/lib/seo-correduria/serp'
import { leerPosthog } from '@/lib/seo-correduria/posthog'
import { accionPropuesta, redactarInforme } from '@/lib/seo-correduria/informe'
import { lunesDe } from '@/lib/seo-correduria/semana'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const AGENTE = 'seo_correduria'

/** Envuelve una lectura en el tri-estado: secreto ausente → no_configurado; excepción → error. */
async function conEstado<T>(faltan: string[], leer: () => Promise<T>): Promise<ResultadoFuente<T>> {
  if (faltan.length) return { estado: 'no_configurado', detalle: `falta ${faltan.join(' y ')}` }
  try {
    return { estado: 'ok', datos: await leer() }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { estado: 'error', detalle: msg.slice(0, 300) }
  }
}

function ausentes(nombres: string[]): string[] {
  return nombres.filter(n => !process.env[n]?.trim())
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Date()
  const semana = lunesDe(hoy)
  const f = fetch as (input: string, init?: RequestInit) => Promise<Response>

  const [gsc, serp, posthog] = await Promise.all([
    conEstado(ausentes(['GSC_SA_CLIENT_EMAIL', 'GSC_SA_PRIVATE_KEY']), async () => {
      const token = await tokenCuentaServicio(
        {
          clientEmail: process.env.GSC_SA_CLIENT_EMAIL!,
          privateKey: process.env.GSC_SA_PRIVATE_KEY!,
          scope: 'https://www.googleapis.com/auth/webmasters.readonly',
        },
        f,
      )
      return leerGsc({ token, propiedad: PROPIEDAD_GSC, hoy }, f)
    }),
    conEstado(ausentes(['SERPER_API_KEY']), () =>
      leerSerp(
        {
          apiKey: process.env.SERPER_API_KEY!,
          dominio: DOMINIO_PROPIO,
          consultas: CONSULTAS.map(c => ({ consulta: c.consulta, pagina: c.pagina })),
        },
        f,
      ),
    ),
    conEstado(ausentes(['POSTHOG_PERSONAL_API_KEY']), () =>
      leerPosthog(
        {
          apiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
          projectId: process.env.POSTHOG_PROJECT_ID?.trim() || POSTHOG_PROJECT_ID_DEFECTO,
          host: (process.env.POSTHOG_API_HOST?.trim() || POSTHOG_API_HOST_DEFECTO).replace(/\/+$/, ''),
        },
        f,
      ),
    ),
  ])

  const resultados: Resultados = { gsc, serp, posthog }

  // Una fila por fuente. Upsert por (semana, fuente): re-lanzar el cron el mismo lunes no duplica.
  const fecha = new Date(`${semana}T00:00:00Z`)
  const filas: [Fuente, ResultadoFuente<unknown>][] = [['gsc', gsc], ['serp', serp], ['posthog', posthog]]
  for (const [fuente, r] of filas) {
    const data = {
      estado: r.estado,
      detalle: r.estado === 'ok' ? null : r.detalle,
      datos: r.estado === 'ok' ? (r.datos as object) : undefined,
    }
    await prisma.seoCorreduriaSemana.upsert({
      where: { semana_fuente: { semana: fecha, fuente } },
      create: { semana: fecha, fuente, ...data },
      update: data,
    })
  }

  const accion = accionPropuesta(resultados, CONSULTAS)
  const texto = redactarInforme(semana, resultados, accion, DOMINIO_PROPIO)
  // El id va LITERAL (no en una const): el guardián lib/telegram/catalogo.test.ts lee el fuente.
  await tgAviso('correduria.seo-semana', texto, { html: true })

  const estados = { gsc: gsc.estado, serp: serp.estado, posthog: posthog.estado }
  const todasOk = Object.values(estados).every(e => e === 'ok')
  const detalle = todasOk
    ? `semana ${semana}: 3/3 fuentes ok`
    : `semana ${semana}: ` +
      filas
        .filter(([, r]) => r.estado !== 'ok')
        .map(([fuente, r]) => `${fuente}=${r.estado}${r.estado === 'ok' ? '' : ` (${r.detalle})`}`)
        .join(' · ')
  await registrarLatido(AGENTE, todasOk, detalle)

  return NextResponse.json({ ok: todasOk, semana, estados, accion: accion.tipo })
}

export { handler as GET, handler as POST }
