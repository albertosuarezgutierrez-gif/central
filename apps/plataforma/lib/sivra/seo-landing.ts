// apps/plataforma/lib/sivra/seo-landing.ts
// Lectura/escritura de la landing estática housesevillana (ahora en el propio monorepo,
// fichero app/route.ts) vía GitHub Contents API. Usado por /api/sivra/seo-refresh.
//
// Versión BLINDADA (portada del patrón de apps/sivra/lib/seo-landing.ts): si la GitHub API
// no devuelve un fichero (token ausente/inválido, 401/403/404, rate-limit), lanza un error
// CLARO en vez del críptico `Buffer.from(undefined)` (ERR_INVALID_ARG_TYPE) que petaba antes.

const LANDING_API = 'https://api.github.com/repos/albertosuarezgutierrez-gif/central/contents/apps/housesevillana/app/route.ts'

export function githubToken(): string {
  const t = process.env.GITHUB_TOKEN
  if (!t) throw new Error('Falta GITHUB_TOKEN en el entorno de plataforma (necesario para leer y commitear la landing de housesevillana).')
  return t
}

/**
 * Decodifica la respuesta de la GitHub Contents API. PURA y testeable (no toca red).
 * Si la respuesta no es un fichero con `content`, lanza un error explícito en vez de
 * dejar que `Buffer.from(undefined)` reviente con un mensaje incomprensible.
 */
export function decodeLanding(ok: boolean, status: number, body: unknown): { content: string; sha: string } {
  const d = body as { content?: unknown; sha?: unknown; message?: unknown } | null
  if (!ok || typeof d?.content !== 'string') {
    const detalle = typeof d?.message === 'string' ? d.message : `HTTP ${status}`
    throw new Error(`No se pudo leer la landing desde GitHub (${status}): ${detalle}. Revisa GITHUB_TOKEN y su acceso a apps/housesevillana del repo central.`)
  }
  return { content: Buffer.from(d.content, 'base64').toString('utf-8'), sha: d.sha as string }
}

export async function fetchLanding(): Promise<{ content: string; sha: string }> {
  const res = await fetch(LANDING_API, {
    headers: { Authorization: `token ${githubToken()}`, 'User-Agent': 'plataforma-seo', Accept: 'application/vnd.github+json' },
  })
  const d = await res.json().catch(() => ({}))
  return decodeLanding(res.ok, res.status, d)
}

export async function pushToGitHub(content: string, sha: string, message: string): Promise<void> {
  const res = await fetch(LANDING_API, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken()}`, 'Content-Type': 'application/json', 'User-Agent': 'plataforma-seo' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  })
  if (!res.ok) throw new Error(`GitHub push failed (${res.status}): ${await res.text()}`)
}

// 🚨 Las regex aceptan los DOS estilos de comilla del app/route.ts de la landing: comillas
// NORMALES (") — el fichero real lleva el HTML en un template literal sin escapar — y
// escapadas (\"), el estilo antiguo para el que se escribieron. La backreference \2 fija el
// estilo encontrado por tag. Sin la tolerancia, description/og:* no casaban con la landing
// actual y el agente actualizaba SOLO el <title> en silencio (detectado 03/08/2026: la
// landing viva conservaba las metas de junio con el title nuevo).
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

export function applySeoReplacements(raw: string, title: string, description: string, ogDescription: string): string {
  return raw
    .replace(/<title>[^<]*<\/title>/, `<title>${title}<\/title>`)
    .replace(RE_DESC,     (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, description)}${q}`)
    .replace(RE_OG_TITLE, (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, title)}${q}`)
    .replace(RE_OG_DESC,  (_m, pre: string, q: string) => `${pre}${escSegunEstilo(q, ogDescription)}${q}`)
}
