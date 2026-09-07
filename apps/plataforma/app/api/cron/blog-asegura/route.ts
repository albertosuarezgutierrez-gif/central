// Agente quincenal del blog de la correduría.
//
// Redacta el siguiente artículo de la cola, lo valida, y deja un PR abierto en
// `apps/asegura-web`. **No publica**: publicar es un clic de Alberto en
// `/correduria`. El artículo se firma con su nombre y su clave DGSFP, y lo lee
// alguien a punto de decidir sobre un plazo legal.
//
// ─── Por qué abre PR y no commitea a main ──────────────────────────────────
// El agente hermano de `apps/ia-rest` commitea directo a `main` con `GH_PAT`.
// Se escribió antes de que `main` tuviera ruleset y hoy es la vía por la que un
// artículo llega a producción sin que ningún check lo mire. Aquí se usa el
// patrón de `lib/sivra/seo-landing.ts`: rama propia + PR, y que la CI decida.
// El beneficio concreto: el artículo es TypeScript, así que pasa por `tsc` y
// por los diez cepos del blog —copy regulado, citas verificadas contra el BOE,
// medidas de la SERP, canibalización— antes de que nadie lo lea.
//
// ─── Y por qué el aviso va a Telegram ──────────────────────────────────────
// Aquel agente tiene cuatro borradores parados desde junio. No falló generar:
// falló que el borrador espera donde nadie entra. Regla del monorepo: la
// pregunta no es «¿lo he dejado hecho?» sino «¿en qué pantalla lo va a ver?».

import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { chatConDirector } from '@/lib/pasarela'
import { tgAviso } from '@/lib/telegram'
import { elegirTema, temasRestantes } from '@/lib/correduria/blog-temas'
import {
  construirPrompt,
  parsearRespuesta,
  revisarGenerado,
  textoPlano,
  bloqueTs,
  insertarEnFuente,
  slugsPublicados,
} from '@/lib/correduria/blog-agente'
import { MARCA_INI, MARCA_FIN } from '@/lib/correduria/blog-pr'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const REPO = 'albertosuarezgutierrez-gif/central'
const FICHERO = 'apps/asegura-web/lib/articulos.ts'
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

/** Resetea la rama a `main` antes de escribir: el PR siempre parte de lo último. */
async function prepararRama(token: string): Promise<void> {
  const r = await fetch(`${API}/git/ref/heads/main`, { headers: cabeceras(token) })
  if (!r.ok) throw new Error(`No se lee main: ${r.status}`)
  const sha = (await r.json()).object.sha as string

  const patch = await fetch(`${API}/git/refs/heads/${RAMA}`, {
    method: 'PATCH',
    headers: cabeceras(token),
    body: JSON.stringify({ sha, force: true }),
  })
  if (patch.ok) return
  const post = await fetch(`${API}/git/refs`, {
    method: 'POST',
    headers: cabeceras(token),
    body: JSON.stringify({ ref: `refs/heads/${RAMA}`, sha }),
  })
  if (!post.ok && post.status !== 422) throw new Error(`No se crea la rama: ${post.status}`)
}

/**
 * Abre el PR (o devuelve el que ya está abierto en esta rama).
 *
 * 🚨 Devuelve el MOTIVO cuando falla, no `null`. Escribir el fichero y abrir el
 * PR piden permisos distintos del PAT (`Contents` y `Pull requests`), así que
 * hay un fallo posible en el que el artículo se escribe, la rama queda bien y
 * el PR no aparece — indistinguible desde fuera de «el agente no ha hecho
 * nada». Hoy los tres PAT con acceso al repo tienen los dos permisos
 * (comprobado el 07/09/2026), pero eso puede cambiar sin que nadie avise: el
 * 403 trae la causa, así que se cuenta en vez de devolver `null`.
 */
async function abrirPr(
  token: string, titulo: string, cuerpo: string,
): Promise<{ url: string } | { error: string }> {
  const abiertos = await fetch(
    `${API}/pulls?state=open&head=${REPO.split('/')[0]}:${RAMA}`,
    { headers: cabeceras(token) },
  )
  if (abiertos.ok) {
    const lista = (await abiertos.json()) as { html_url: string }[]
    if (lista.length > 0) return { url: lista[0].html_url }
  }
  const r = await fetch(`${API}/pulls`, {
    method: 'POST',
    headers: cabeceras(token),
    body: JSON.stringify({ title: titulo, head: RAMA, base: 'main', body: cuerpo, draft: false }),
  })
  if (r.ok) return { url: ((await r.json()) as { html_url: string }).html_url }
  const detalle = (await r.text()).slice(0, 200)
  if (r.status === 403 || r.status === 404) {
    return { error: `GitHub ${r.status}: el token no puede abrir PRs en el repo (mira «Pull requests: Read and write» en el PAT). El artículo está escrito en la rama ${RAMA}.` }
  }
  return { error: `GitHub ${r.status}: ${detalle}` }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = process.env.GITHUB_TOKEN
  // 🚨 Sin token no se «sigue adelante generando y ya se verá»: el artículo se
  // habría escrito (gastando IA) para tirarlo. Se para antes y se dice por qué.
  if (!token) {
    await tgAviso('correduria.blog-fallido', '📝 Blog ASegura: falta `GITHUB_TOKEN`, no puedo abrir el PR. No he generado nada.').catch(() => {})
    return NextResponse.json({ ok: false, motivo: 'sin GITHUB_TOKEN' }, { status: 503 })
  }

  // 1. Qué hay publicado ya. Se lee del fuente, que es la única verdad: una
  //    tabla paralela se desincronizaría del repo en el primer merge a mano.
  const rf = await fetch(`${API}/contents/${FICHERO}?ref=main`, { headers: cabeceras(token) })
  if (!rf.ok) return NextResponse.json({ ok: false, motivo: `no se lee ${FICHERO}: ${rf.status}` }, { status: 502 })
  const meta = (await rf.json()) as { content: string; sha: string }
  const fuente = Buffer.from(meta.content, 'base64').toString('utf-8')
  const publicados = slugsPublicados(fuente)

  // 2. El siguiente tema. `null` es un resultado normal, no un error mudo.
  const tema = elegirTema(publicados)
  if (!tema) {
    await tgAviso(
      'correduria.blog-cola-agotada',
      '📝 Blog ASegura: **la cola de temas está agotada**. No he escrito nada. Los siguientes salen de la Search Console cuando esté conectada, o de temas nuevos en `lib/correduria/blog-temas.ts`.',
    ).catch(() => {})
    return NextResponse.json({ ok: true, sinTemas: true })
  }

  const fecha = new Date().toISOString().slice(0, 10)

  // 3. Redacción. `categoria: 'redaccion'` → Claude Sonnet 4.5 por el Director.
  //    Va por la pasarela y no por un modelo fijado a mano para que cuente en
  //    el presupuesto y quede en `ai_usos` como todo lo demás.
  let generado = null
  let reparos: { campo: string; motivo: string }[] = []
  for (let intento = 1; intento <= 2 && !generado; intento++) {
    const extra =
      intento === 1
        ? ''
        : `\n\nTu respuesta anterior tenía estos problemas y hay que corregirlos TODOS:\n${reparos
            .map((r) => `- ${r.campo}: ${r.motivo}`)
            .join('\n')}`
    const { text } = await chatConDirector(
      [{ role: 'user', content: construirPrompt(tema, fecha) + extra }],
      { app: 'asegura', endpoint: 'blog', categoria: 'redaccion', maxTokens: 4_000, temperature: 0.4, timeoutMs: 90_000 },
    )
    const candidato = parsearRespuesta(text)
    if (!candidato) {
      reparos = [{ campo: 'formato', motivo: 'la respuesta no traía un JSON legible' }]
      continue
    }
    const encontrados = revisarGenerado(candidato, tema)
    if (encontrados.length === 0) generado = candidato
    else reparos = encontrados
  }

  // 4. Si sigue con reparos, NO se abre PR. Se dice qué falló, con el detalle:
  //    un «no he podido» sin motivo obliga a reproducirlo a mano para saberlo.
  if (!generado) {
    await tgAviso(
      'correduria.blog-fallido',
      `📝 Blog ASegura: he descartado el artículo sobre «${tema.consulta}» tras dos intentos.\n\n` +
        reparos.map((r) => `· ${r.campo}: ${r.motivo}`).join('\n'),
    ).catch(() => {})
    return NextResponse.json({ ok: false, tema: tema.slug, reparos })
  }

  // 5. PR.
  try {
    await prepararRama(token)
    const nuevo = insertarEnFuente(fuente, bloqueTs(generado, tema, fecha))
    const put = await fetch(`${API}/contents/${FICHERO}`, {
      method: 'PUT',
      headers: cabeceras(token),
      body: JSON.stringify({
        message: `blog(asegura-web): ${generado.h1}`,
        content: Buffer.from(nuevo).toString('base64'),
        sha: meta.sha,
        branch: RAMA,
      }),
    })
    if (!put.ok) throw new Error(`PUT ${put.status}: ${(await put.text()).slice(0, 200)}`)

    const pr = await abrirPr(
      token,
      `blog(asegura-web): ${generado.h1}`,
      [
        `Artículo generado por el agente quincenal para la consulta **«${tema.consulta}»**.`,
        '',
        `**Normas citadas:** ${tema.normas.length > 0 ? tema.normas.join(', ') : 'ninguna'} (verificadas en \`NORMAS_CITABLES\`).`,
        '',
        'Pasó la revisión previa: copy regulado, citas respaldadas, medidas de SERP y secciones completas. Los cepos del blog vuelven a comprobarlo en CI.',
        '',
        '⚠️ **Léelo antes de mergear.** La validación comprueba que no cite normas sin verificar; no comprueba que el razonamiento sea correcto.',
        '',
        '## Texto',
        '',
        // 🚨 El texto viaja AQUÍ, entre marcas, porque es lo que lee la pantalla
        // de `/correduria`. La alternativa —que la pantalla bajara `articulos.ts`
        // de la rama y volviera a parsear el bloque— serían dos parsers del mismo
        // formato desincronizándose, y el fallo sería enseñar un texto que no es
        // exactamente el que se publica.
        MARCA_INI,
        textoPlano(generado),
        MARCA_FIN,
      ].join('\n'),
    )

    const quedan = temasRestantes([...publicados, tema.slug])
    const url = 'url' in pr ? pr.url : null

    // Sin PR el artículo NO se puede aprobar desde `/correduria` (esa pantalla
    // lista PRs). Así que esto no es «listo con un detalle»: es un fallo, y va
    // por el interruptor de fallos con el motivo delante.
    if (!url) {
      await tgAviso(
        'correduria.blog-fallido',
        `📝 Blog ASegura: he escrito «${generado.h1}» y lo he dejado en la rama \`${RAMA}\`, pero NO he podido abrir el PR.\n\n${'error' in pr ? pr.error : ''}\n\nHasta que exista el PR no sale en /correduria → Redes.`,
      ).catch(() => {})
      return NextResponse.json({ ok: false, slug: tema.slug, motivo: 'error' in pr ? pr.error : 'sin PR' }, { status: 502 })
    }

    await tgAviso(
      'correduria.blog-listo',
      `📝 <b>Blog ASegura — artículo listo para revisar</b>\n\n` +
        `<b>${generado.h1}</b>\n${generado.resumen}\n\n` +
        `Consulta: «${tema.consulta}»\n` +
        `PR: ${url}\n` +
        `Apruébalo en /correduria → Redes. Aquí no se publica nada solo.\n\n` +
        (quedan <= 1 ? `⚠️ Quedan ${quedan} temas en la cola.` : `Quedan ${quedan} temas.`),
      { html: true },
    ).catch(() => {})

    return NextResponse.json({ ok: true, slug: tema.slug, pr: url, quedan })
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    await tgAviso('correduria.blog-fallido', `📝 Blog ASegura: el artículo salió bien pero **no pude abrir el PR**: ${motivo}`).catch(() => {})
    return NextResponse.json({ ok: false, tema: tema.slug, motivo }, { status: 502 })
  }
}
