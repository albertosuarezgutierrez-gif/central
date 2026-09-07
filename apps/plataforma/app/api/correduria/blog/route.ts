// /api/correduria/blog — los artículos que el agente quincenal ha dejado
// esperando el OK de Alberto, y los dos botones que deciden su suerte.
//
// ─── Por qué esto existe y no basta con GitHub ─────────────────────────────
// El agente hermano de `apps/ia-rest` deja borradores desde junio: cuatro
// llevan meses parados. No falló generar — falló que el borrador espera en una
// pantalla en la que Alberto no entra. Regla del monorepo: la pregunta no es
// «¿lo he dejado hecho?» sino «¿en qué pantalla lo va a ver?». Esta es esa
// pantalla, y por eso la aprobación vive en `/correduria` y no en un PR.
//
// Esta ruta NO escribe el artículo: lo escribió el cron en una rama. Aquí solo
// se lee el PR abierto y se mezcla o se cierra.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { extraerArticuloDePr, estadoPr, motivoMerge } from '@/lib/correduria/blog-pr'

export const dynamic = 'force-dynamic'

const REPO = 'albertosuarezgutierrez-gif/central'
const RAMA = 'claude/blog-asegura'
const API = `https://api.github.com/repos/${REPO}`

function cabeceras(token: string) {
  return {
    Authorization: `token ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'central-blog-asegura',
    Accept: 'application/vnd.github+json',
  }
}

type PrGitHub = {
  number: number
  title: string
  body: string | null
  html_url: string
  created_at: string
  draft?: boolean
  mergeable?: boolean | null
  mergeable_state?: string | null
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.GITHUB_TOKEN
  // Sin token no hay lista, y eso NO es «no hay artículos pendientes»: es que
  // no se ha podido mirar. La pantalla tiene que poder decir la diferencia.
  if (!token) return NextResponse.json({ estado: 'sin_configurar' })

  try {
    const r = await fetch(
      `${API}/pulls?state=open&head=${REPO.split('/')[0]}:${RAMA}`,
      { headers: cabeceras(token), cache: 'no-store' },
    )
    if (!r.ok) return NextResponse.json({ estado: 'error', motivo: `GitHub ${r.status}` })
    const lista = (await r.json()) as PrGitHub[]

    // La LISTA de PRs no trae `mergeable`/`mergeable_state`: solo el detalle. Se
    // piden uno a uno porque como mucho hay un PR abierto en esta rama (el cron
    // reutiliza el que ya está). Si el detalle falla, la fila se pinta igual con
    // el estado sin comprobar — perder el artículo por no saber su semáforo
    // sería el mismo silencio que esta pantalla viene a romper.
    const prs = await Promise.all(lista.slice(0, 5).map(async (p) => {
      let detalle: PrGitHub = p
      try {
        const d = await fetch(`${API}/pulls/${p.number}`, { headers: cabeceras(token), cache: 'no-store' })
        if (d.ok) detalle = (await d.json()) as PrGitHub
      } catch { /* se queda con lo de la lista: estado 'no_comprobado' */ }
      return {
        numero: p.number,
        titulo: p.title,
        url: p.html_url,
        creado: p.created_at,
        // `null` = no se puede enseñar el texto (nunca un recuadro vacío).
        articulo: extraerArticuloDePr(detalle.body ?? p.body),
        estado: estadoPr(detalle),
      }
    }))

    return NextResponse.json({ estado: 'ok', prs })
  } catch (e) {
    return NextResponse.json({ estado: 'error', motivo: e instanceof Error ? e.message : 'fallo de red' })
  }
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const token = process.env.GITHUB_TOKEN
  if (!token) return NextResponse.json({ ok: false, motivo: 'Falta GITHUB_TOKEN en Vercel.' }, { status: 503 })

  const body = await req.json().catch(() => null) as { numero?: number; accion?: string } | null
  const numero = body?.numero
  const accion = body?.accion
  if (typeof numero !== 'number' || (accion !== 'publicar' && accion !== 'descartar')) {
    return NextResponse.json({ ok: false, motivo: 'Petición incompleta.' }, { status: 400 })
  }

  // 🚨 Se comprueba que el PR es de LA rama del agente antes de tocarlo. Sin
  // esto, este endpoint mezclaría cualquier PR abierto del repo por su número.
  const info = await fetch(`${API}/pulls/${numero}`, { headers: cabeceras(token), cache: 'no-store' })
  if (!info.ok) {
    return NextResponse.json({ ok: false, motivo: motivoMerge(info.status, '') }, { status: 400 })
  }
  const pr = (await info.json()) as { head?: { ref?: string }; title?: string }
  if (pr.head?.ref !== RAMA) {
    return NextResponse.json({ ok: false, motivo: 'Ese PR no es del agente del blog.' }, { status: 400 })
  }

  if (accion === 'descartar') {
    const r = await fetch(`${API}/pulls/${numero}`, {
      method: 'PATCH', headers: cabeceras(token), body: JSON.stringify({ state: 'closed' }),
    })
    if (!r.ok) {
      const txt = (await r.text()).slice(0, 200)
      return NextResponse.json({ ok: false, motivo: motivoMerge(r.status, txt), detalle: txt }, { status: 502 })
    }
    return NextResponse.json({ ok: true, accion: 'descartar' })
  }

  const r = await fetch(`${API}/pulls/${numero}/merge`, {
    method: 'PUT',
    headers: cabeceras(token),
    body: JSON.stringify({ merge_method: 'squash', commit_title: `${pr.title ?? 'blog'} (#${numero})` }),
  })
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 300)
    let mensaje = txt
    try { mensaje = (JSON.parse(txt) as { message?: string }).message ?? txt } catch { /* texto plano */ }
    return NextResponse.json(
      { ok: false, motivo: motivoMerge(r.status, mensaje), detalle: mensaje },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, accion: 'publicar' })
}
