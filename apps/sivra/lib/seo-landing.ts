// apps/sivra/lib/seo-landing.ts
// Lectura/escritura de la landing estática housesevillana (repo house-sevillana-landing,
// fichero app/route.ts) vía GitHub Contents API. Compartido por seo-refresh y seo-revert.

const LANDING_API = 'https://api.github.com/repos/albertosuarezgutierrez-gif/house-sevillana-landing/contents/app/route.ts'

export function githubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) throw new Error('Falta GITHUB_TOKEN en el entorno de sivra (necesario para leer y commitear la landing de housesevillana). Se configura desde el panel /operador/secretos de plataforma (escribe en sivra + plataforma y redespliega).')
  return t
}

export async function fetchLanding(): Promise<{ content: string; sha: string }> {
  const res = await fetch(LANDING_API, {
    headers: { Authorization: `token ${githubToken()}`, 'User-Agent': 'roi-intranet-seo', Accept: 'application/vnd.github+json' },
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || typeof d?.content !== 'string') {
    const detalle = typeof d?.message === 'string' ? d.message : `HTTP ${res.status}`
    throw new Error(`No se pudo leer la landing desde GitHub (${res.status}): ${detalle}. Revisa GITHUB_TOKEN y su acceso al repo house-sevillana-landing.`)
  }
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha as string }
}

export async function pushToGitHub(content: string, sha: string, message: string): Promise<void> {
  const res = await fetch(LANDING_API, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken()}`, 'Content-Type': 'application/json', 'User-Agent': 'roi-intranet-seo' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  })
  if (!res.ok) throw new Error(`GitHub push failed (${res.status}): ${await res.text()}`)
}

export function extractSeoParams(raw: string) {
  return {
    title:         raw.match(/<title>([^<]+)<\/title>/)?.[1]                                    ?? '',
    description:   raw.match(/<meta name=\\"description\\" content=\\"([^\\"]+)\\"/)?.[1]       ?? '',
    ogDescription: raw.match(/<meta property=\\"og:description\\" content=\\"([^\\"]+)\\"/)?.[1] ?? '',
  }
}

export function escJs(s: string): string { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }

/**
 * Reescribe title/description/og en la landing. Si se pasa `schemaJson` Y la landing ya
 * contiene un bloque ld+json, lo reemplaza; si no existe el bloque, NO inserta nada
 * (la landing es un string con comillas escapadas en un repo externo no inspeccionable).
 */
export function applySeoReplacements(
  raw: string, title: string, description: string, ogDescription: string, schemaJson?: string,
): string {
  let out = raw
    .replace(/<title>[^<]*<\/title>/, `<title>${title}<\/title>`)
    .replace(/<meta name=\\"description\\" content=\\"[^\\"]*\\"/, `<meta name=\\"description\\" content=\\"${escJs(description)}\\"`)
    .replace(/<meta property=\\"og:title\\" content=\\"[^\\"]*\\"/, `<meta property=\\"og:title\\" content=\\"${escJs(title)}\\"`)
    .replace(/<meta property=\\"og:description\\" content=\\"[^\\"]*\\"/, `<meta property=\\"og:description\\" content=\\"${escJs(ogDescription)}\\"`)
  if (schemaJson) {
    const ldRe = /<script type=\\"application\/ld\+json\\">[\s\S]*?<\/script>/
    if (ldRe.test(out)) {
      out = out.replace(ldRe, `<script type=\\"application\/ld+json\\">${escJs(schemaJson)}<\/script>`)
    }
  }
  return out
}
