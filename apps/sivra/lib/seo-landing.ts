// apps/sivra/lib/seo-landing.ts
// Lectura/escritura de la landing estática housesevillana (ahora en el propio monorepo,
// fichero app/route.ts) vía GitHub Contents API. Compartido por seo-refresh y seo-revert.

const LANDING_API = 'https://api.github.com/repos/albertosuarezgutierrez-gif/central/contents/apps/housesevillana/app/route.ts'

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
    throw new Error(`No se pudo leer la landing desde GitHub (${res.status}): ${detalle}. Revisa GITHUB_TOKEN y su acceso a apps/housesevillana del repo central.`)
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

// 🚨 Las regex aceptan los DOS estilos de comilla del app/route.ts de la landing: comillas
// NORMALES (") — el fichero real lleva el HTML en un template literal sin escapar — y
// escapadas (\"), el estilo antiguo para el que se escribieron. La backreference \2 fija el
// estilo encontrado por tag. Sin la tolerancia, description/og:* no casaban con la landing
// actual y el agente actualizaba SOLO el <title> en silencio (detectado 03/08/2026). Si esto
// cambia, replicar en apps/plataforma/lib/sivra/seo-landing.ts (misma pareja de siempre).
const RE_DESC     = /(<meta name=(\\?")description\2 content=\2)(.*?)\2/
const RE_OG_TITLE = /(<meta property=(\\?")og:title\2 content=\2)(.*?)\2/
const RE_OG_DESC  = /(<meta property=(\\?")og:description\2 content=\2)(.*?)\2/

export function extractSeoParams(raw: string) {
  return {
    title:         raw.match(/<title>([^<]+)<\/title>/)?.[1] ?? '',
    description:   raw.match(RE_DESC)?.[3]    ?? '',
    ogDescription: raw.match(RE_OG_DESC)?.[3] ?? '',
  }
}

export function escJs(s: string): string { return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') }

/** Escapa el texto SOLO si el tag usa comillas escapadas (q = '\\"'); con comillas normales va tal cual. */
const escSegunEstilo = (q: string, s: string): string => (q.length > 1 ? escJs(s) : s)

/**
 * Reescribe title/description/og en la landing. Si se pasa `schemaJson` Y la landing ya
 * contiene un bloque ld+json, reemplaza el PRIMERO (LodgingBusiness); si no existe el
 * bloque, NO inserta nada.
 */
export function applySeoReplacements(
  raw: string, title: string, description: string, ogDescription: string, schemaJson?: string,
): string {
  let out = raw
    .replace(/<title>[^<]*<\/title>/, `<title>${title}<\/title>`)
    .replace(RE_DESC,     (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, description)}${q}`)
    .replace(RE_OG_TITLE, (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, title)}${q}`)
    .replace(RE_OG_DESC,  (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, ogDescription)}${q}`)
  if (schemaJson) {
    const ldRe = /<script type=(\\?")application\/ld\+json\1>[\s\S]*?<\/script>/
    if (ldRe.test(out)) {
      out = out.replace(ldRe, (_m, q: string) =>
        `<script type=${q}application/ld+json${q}>${escSegunEstilo(q, schemaJson)}<\/script>`)
    }
  }
  return out
}
