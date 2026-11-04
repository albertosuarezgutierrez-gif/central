// @central/core-instagram — publicación en Instagram por la Graph API (graph.instagram.com).
//
// ─── Por qué PARAMETRIZADO y no leyendo envs ───────────────────────────────
// El primer cliente (`apps/ia-rest/src/lib/instagram.ts`) lee
// `INSTAGRAM_ACCESS_TOKEN`/`INSTAGRAM_USER_ID` a nivel de módulo. Eso ata la
// función a UNA cuenta de Instagram por proyecto Vercel. La casa de marcas
// tiene varias marcas (ia.rest, Grupo ASegura…) y alguna app publica para más
// de una: aquí las credenciales llegan en cada llamada y la app decide de qué
// env salen y si se publica o no. Este paquete no sabe de ninguna vertical.
//
// ─── Lo que NO hace ────────────────────────────────────────────────────────
// No decide CUÁNDO se publica: eso es de la app (en la correduría, nada sale
// sin el botón de Alberto). No reintenta una publicación: un reintento a ciegas
// de `media_publish` puede dejar el post DOS veces en el perfil.
//
// 🚨 Nunca un fallback a literal: sin token o sin userId, lanza.

export const GRAPH_VERSION_POR_DEFECTO = 'v21.0'

export type CredencialesInstagram = {
  /** Token de larga duración de la cuenta profesional de Instagram. */
  token: string
  /** Id de usuario de Instagram (el de `/me`), no el de la página de Facebook. */
  userId: string
}

export type OpcionesGraph = {
  /** Inyectable para tests. Por defecto, el `fetch` global. */
  fetch?: typeof fetch
  /** Inyectable para tests (evita esperas reales). */
  esperar?: (ms: number) => Promise<void>
  /** Versión de la Graph API. */
  version?: string
}

/** `true` si las dos credenciales tienen contenido. Útil para decidir si hay publicación real. */
export function credencialesCompletas(c: Partial<CredencialesInstagram> | null | undefined): c is CredencialesInstagram {
  return !!c && typeof c.token === 'string' && c.token.trim() !== '' && typeof c.userId === 'string' && c.userId.trim() !== ''
}

function exigir(c: CredencialesInstagram): void {
  if (!credencialesCompletas(c)) throw new Error('core-instagram: faltan credenciales (token y userId)')
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Ctx = { f: typeof fetch; esperar: (ms: number) => Promise<void>; base: string }

function ctx(o: OpcionesGraph = {}): Ctx {
  return {
    f: o.fetch ?? fetch,
    esperar: o.esperar ?? dormir,
    base: `https://graph.instagram.com/${o.version ?? GRAPH_VERSION_POR_DEFECTO}`,
  }
}

/** Mensaje de error de la Graph API sin arrastrar nunca el token. */
function motivoGraph(d: unknown): string {
  const e = (d as { error?: { message?: string; code?: number } } | null)?.error
  if (e?.message) return `${e.message}${e.code ? ` (código ${e.code})` : ''}`
  return 'respuesta sin id'
}

async function postJson(c: Ctx, url: string, body: Record<string, unknown>): Promise<{ id?: string; error?: unknown }> {
  const r = await c.f(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return (await r.json().catch(() => ({}))) as { id?: string; error?: unknown }
}

/** Espera a que un contenedor esté `FINISHED`. Lanza con el último estado si no llega. */
async function esperarContenedor(c: Ctx, cred: CredencialesInstagram, id: string, intentos: number, pausaMs: number): Promise<void> {
  let estado = 'IN_PROGRESS'
  for (let i = 0; i < intentos && estado === 'IN_PROGRESS'; i++) {
    await c.esperar(pausaMs)
    const r = await c.f(`${c.base}/${id}?fields=status_code&access_token=${encodeURIComponent(cred.token)}`)
    const s = (await r.json().catch(() => ({}))) as { status_code?: string }
    estado = s.status_code || 'ERROR'
  }
  if (estado !== 'FINISHED') throw new Error(`core-instagram: contenedor no listo (${estado})`)
}

async function publicarContenedor(c: Ctx, cred: CredencialesInstagram, creationId: string): Promise<string> {
  const pub = await postJson(c, `${c.base}/${cred.userId}/media_publish`, { creation_id: creationId, access_token: cred.token })
  if (!pub.id) throw new Error(`core-instagram: no se pudo publicar: ${motivoGraph(pub)}`)
  return pub.id
}

/** Publica UNA imagen en el feed. Devuelve el id del post publicado. */
export async function publicarImagen(
  cred: CredencialesInstagram,
  imageUrl: string,
  caption: string,
  opts: OpcionesGraph = {},
): Promise<string> {
  exigir(cred)
  const c = ctx(opts)
  const d = await postJson(c, `${c.base}/${cred.userId}/media`, { image_url: imageUrl, caption, access_token: cred.token })
  if (!d.id) throw new Error(`core-instagram: no se pudo crear el contenedor: ${motivoGraph(d)}`)
  await esperarContenedor(c, cred, d.id, 10, 3000)
  return publicarContenedor(c, cred, d.id)
}

/** Publica un carrusel (2-10 imágenes). Devuelve el id del post publicado. */
export async function publicarCarrusel(
  cred: CredencialesInstagram,
  imageUrls: readonly string[],
  caption: string,
  opts: OpcionesGraph = {},
): Promise<string> {
  exigir(cred)
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`core-instagram: un carrusel lleva de 2 a 10 imágenes (llegan ${imageUrls.length})`)
  }
  const c = ctx(opts)
  const hijos: string[] = []
  for (const url of imageUrls) {
    const h = await postJson(c, `${c.base}/${cred.userId}/media`, { image_url: url, is_carousel_item: true, access_token: cred.token })
    if (!h.id) throw new Error(`core-instagram: no se pudo crear la diapositiva ${hijos.length + 1}: ${motivoGraph(h)}`)
    hijos.push(h.id)
    await c.esperar(1000)
  }
  const car = await postJson(c, `${c.base}/${cred.userId}/media`, {
    media_type: 'CAROUSEL', children: hijos.join(','), caption, access_token: cred.token,
  })
  if (!car.id) throw new Error(`core-instagram: no se pudo crear el carrusel: ${motivoGraph(car)}`)
  await esperarContenedor(c, cred, car.id, 10, 3000)
  return publicarContenedor(c, cred, car.id)
}
