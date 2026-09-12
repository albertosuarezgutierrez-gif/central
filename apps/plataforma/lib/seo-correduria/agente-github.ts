// lib/seo-correduria/agente-github.ts — lee y escribe apps/asegura-web/lib/ramos.ts por la
// GitHub Contents API. Mismo patrón que apps/sivra/lib/seo-landing.ts (housesevillana), con
// UNA diferencia deliberada: el PR se abre en DRAFT y esta rutina NUNCA lo mergea — a
// diferencia de la landing (contenido puramente descriptivo), aquí el copy está sujeto a
// RDL 3/2020 (`ramos.test.ts`) y a las reglas de comunicaciones salientes: lo revisa Alberto.

const REPO_API = 'https://api.github.com/repos/albertosuarezgutierrez-gif/central'
const RUTA_RAMOS = 'apps/asegura-web/lib/ramos.ts'
const RAMA_SEO_ASEGURA = 'claude/seo-asegura-web-agente'

export function githubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) throw new Error('Falta GITHUB_TOKEN en plataforma (necesario para proponer cambios de SEO a apps/asegura-web). Se configura desde /operador/secretos y se redespliega.')
  return t
}

function cabecerasGh(): Record<string, string> {
  return {
    Authorization: `token ${githubToken()}`,
    'Content-Type': 'application/json',
    'User-Agent': 'plataforma-seo-asegura-agente',
    Accept: 'application/vnd.github+json',
  }
}

export async function leerRamosTs(): Promise<{ content: string; sha: string }> {
  const res = await fetch(`${REPO_API}/contents/${RUTA_RAMOS}`, { headers: cabecerasGh() })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || typeof d?.content !== 'string') {
    const detalle = typeof d?.message === 'string' ? d.message : `HTTP ${res.status}`
    throw new Error(`No se pudo leer ${RUTA_RAMOS} desde GitHub (${res.status}): ${detalle}`)
  }
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha as string }
}

/** Deja `RAMA_SEO_ASEGURA` apuntando al `main` de ahora mismo (la crea si no existía). Se
 *  resetea en cada pasada: si el PR anterior no se mergeó, esta lo reemplaza. */
async function prepararRama(): Promise<void> {
  const main = await fetch(`${REPO_API}/git/ref/heads/main`, { headers: cabecerasGh() })
  const d = await main.json().catch(() => ({}))
  const sha = d?.object?.sha
  if (!main.ok || typeof sha !== 'string') {
    throw new Error(`No se pudo leer el HEAD de main (${main.status}): ${typeof d?.message === 'string' ? d.message : ''}`)
  }
  const mover = await fetch(`${REPO_API}/git/refs/heads/${RAMA_SEO_ASEGURA}`, {
    method: 'PATCH', headers: cabecerasGh(), body: JSON.stringify({ sha, force: true }),
  })
  if (mover.ok) return
  if (mover.status !== 422 && mover.status !== 404) {
    throw new Error(`No se pudo mover la rama ${RAMA_SEO_ASEGURA} (${mover.status}): ${await mover.text()}`)
  }
  const crear = await fetch(`${REPO_API}/git/refs`, {
    method: 'POST', headers: cabecerasGh(), body: JSON.stringify({ ref: `refs/heads/${RAMA_SEO_ASEGURA}`, sha }),
  })
  if (!crear.ok) throw new Error(`No se pudo crear la rama ${RAMA_SEO_ASEGURA} (${crear.status}): ${await crear.text()}`)
}

async function commitRamos(contenidoNuevo: string, mensaje: string): Promise<void> {
  const actual = await fetch(`${REPO_API}/contents/${RUTA_RAMOS}?ref=${RAMA_SEO_ASEGURA}`, { headers: cabecerasGh() })
  const dActual = await actual.json().catch(() => ({}))
  if (!actual.ok || typeof dActual?.sha !== 'string') {
    throw new Error(`No se pudo leer el sha de ${RUTA_RAMOS} en ${RAMA_SEO_ASEGURA} (${actual.status})`)
  }
  const res = await fetch(`${REPO_API}/contents/${RUTA_RAMOS}`, {
    method: 'PUT',
    headers: cabecerasGh(),
    body: JSON.stringify({
      message: mensaje,
      content: Buffer.from(contenidoNuevo, 'utf-8').toString('base64'),
      sha: dActual.sha,
      branch: RAMA_SEO_ASEGURA,
    }),
  })
  if (!res.ok) throw new Error(`No se pudo commitear ${RUTA_RAMOS} (${res.status}): ${await res.text()}`)
}

/** Abre el PR en DRAFT si no hay ya uno abierto para la rama. Devuelve su URL. */
async function abrirPrDraft(titulo: string, cuerpo: string): Promise<string> {
  const abiertos = await fetch(`${REPO_API}/pulls?head=albertosuarezgutierrez-gif:${RAMA_SEO_ASEGURA}&state=open`, { headers: cabecerasGh() })
  const lista = await abiertos.json().catch(() => [])
  if (Array.isArray(lista) && lista.length && typeof lista[0]?.html_url === 'string') return lista[0].html_url

  const res = await fetch(`${REPO_API}/pulls`, {
    method: 'POST',
    headers: cabecerasGh(),
    body: JSON.stringify({ title: titulo, head: RAMA_SEO_ASEGURA, base: 'main', body: cuerpo, draft: true }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || typeof d?.html_url !== 'string') {
    throw new Error(`No se pudo abrir el PR de ${RAMA_SEO_ASEGURA} (${res.status}): ${typeof d?.message === 'string' ? d.message : ''}`)
  }
  return d.html_url
}

/** Ciclo completo: lee ramos.ts de main, aplica `transformar`, commitea en rama fija y abre
 *  (o reutiliza) el PR draft. Devuelve la URL del PR. `transformar` recibe el contenido
 *  actual de MAIN (no de la rama, que se resetea siempre) y debe devolver el contenido final. */
export async function proponerCambioRamos(opts: {
  transformar: (contenidoMain: string) => string
  commitMsg: string
  prTitulo: string
  prCuerpo: string
}): Promise<string> {
  const { content } = await leerRamosTs()
  const nuevo = opts.transformar(content)
  await prepararRama()
  await commitRamos(nuevo, opts.commitMsg)
  return abrirPrDraft(opts.prTitulo, opts.prCuerpo)
}
