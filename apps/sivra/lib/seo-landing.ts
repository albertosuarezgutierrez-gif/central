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

// Pista que se cuelga de todo 403: es SIEMPRE el mismo fallo y conviene decir el arreglo
// más barato — editar los permisos de un PAT fine-grained NO cambia su valor, así que no hay
// que volver a pegarlo en /operador/secretos ni redesplegar.
const PISTA_403 = ' — el GET funciona porque el repo central es público; un 403 aquí casi siempre es GITHUB_TOKEN sin contents:write sobre albertosuarezgutierrez-gif/central (p. ej. un PAT fine-grained aún limitado al antiguo repo house-sevillana-landing). Arreglo: en GitHub → Fine-grained tokens → ese PAT → Repository access = central + Permissions → Contents: Read and write. Editar permisos NO cambia el valor del token, así que no hace falta volver a pegarlo; solo si está caducado, regenéralo y guárdalo en /operador/secretos de plataforma.'

export async function pushToGitHub(content: string, sha: string, message: string): Promise<void> {
  const res = await fetch(LANDING_API, {
    method: 'PUT',
    headers: { Authorization: `token ${githubToken()}`, 'Content-Type': 'application/json', 'User-Agent': 'roi-intranet-seo' },
    body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), sha }),
  })
  if (!res.ok) {
    const pista = res.status === 403 ? PISTA_403 : ''
    throw new Error(`GitHub push failed (${res.status}): ${await res.text()}${pista}`)
  }
}

// ── Sondeo de permisos (gemelo del de apps/plataforma/lib/sivra/seo-landing.ts) ────────
// El cron semanal de ESTA app es el que falla los lunes, así que el sondeo vive también aquí
// para poder comprobar el token del entorno de sivra, no solo el de plataforma. Si cambia la
// clasificación, replicar en el gemelo (misma pareja de siempre).
//
// Nunca escribe: PUT real con un `sha` imposible (40 ceros). GitHub valida el permiso ANTES
// que el sha ⇒ 403 = sin permiso, 409 = con permiso y sin tocar nada. Y el contenido enviado
// es el ACTUAL sin modificar, así que ni en el caso imposible se pierde la landing.
const SHA_IMPOSIBLE = '0'.repeat(40)

export type EstadoSondeo =
  | 'puede-escribir'   // ✅ verde: GitHub llegó a validar el sha ⇒ el permiso está
  | 'sin-token'        // ❌ no hay GITHUB_TOKEN en el entorno
  | 'token-invalido'   // ❌ 401: caducado, revocado o mal pegado
  | 'sin-permiso'      // ❌ 403: es LO DE SIEMPRE — el PAT no cubre `central` con contents:write
  | 'no-lee'           // ❌ ni siquiera se puede leer la landing (ruta cambiada, red, rate-limit)
  | 'desconocido'      // 🟠 respuesta que no sé interpretar — NUNCA se pinta de verde

export type Sondeo = { estado: EstadoSondeo; mensaje: string; status: number | null }

/**
 * Clasifica la respuesta del PUT-sonda. PURA y testeable (no toca red).
 * 🚨 Solo el 409 se considera verde; lo demás cae en `desconocido`, nunca en «va bien».
 */
export function clasificarSondeo(status: number, cuerpo: string): Sondeo {
  if (status === 409) return {
    estado: 'puede-escribir', status,
    mensaje: 'El token PUEDE commitear en albertosuarezgutierrez-gif/central. GitHub llegó a validar el sha (409 de conflicto), que es el paso posterior al permiso. No se ha escrito nada.',
  }
  if (status === 401) return {
    estado: 'token-invalido', status,
    mensaje: 'GITHUB_TOKEN inválido (401 Bad credentials): caducado, revocado o mal pegado. Genera uno nuevo y guárdalo en /operador/secretos de plataforma.',
  }
  if (status === 403) return {
    estado: 'sin-permiso', status,
    mensaje: `El token NO puede escribir (403).${PISTA_403}`,
  }
  if (status === 404) return {
    estado: 'desconocido', status,
    mensaje: 'GitHub responde 404 al PUT. El repo es público, así que esto apunta a que la ruta de la landing (apps/housesevillana/app/route.ts) ya no existe, no a un problema de permisos.',
  }
  if (status === 200 || status === 201) return {
    estado: 'desconocido', status,
    mensaje: '⚠️ GitHub ACEPTÓ el sondeo (debería haber devuelto 409). El commit escrito es idéntico al contenido actual, así que la landing no cambia, pero revisa el historial del repo.',
  }
  return {
    estado: 'desconocido', status,
    mensaje: `Respuesta inesperada de GitHub (${status}): ${cuerpo.slice(0, 300)}`,
  }
}

/** Sondea de verdad contra GitHub. Nunca modifica la landing. Devuelve SIEMPRE un `Sondeo`; no lanza. */
export async function sondearEscritura(): Promise<Sondeo> {
  let token: string
  try {
    token = githubToken()
  } catch (err) {
    return { estado: 'sin-token', status: null, mensaje: String(err instanceof Error ? err.message : err) }
  }

  let actual: { content: string; sha: string }
  try {
    actual = await fetchLanding()
  } catch (err) {
    return { estado: 'no-lee', status: null, mensaje: String(err instanceof Error ? err.message : err) }
  }

  try {
    const res = await fetch(LANDING_API, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'roi-intranet-seo' },
      body: JSON.stringify({
        message: 'chore(seo): sondeo de permisos — nunca debe aplicarse',
        content: Buffer.from(actual.content).toString('base64'),
        sha: SHA_IMPOSIBLE,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    return clasificarSondeo(res.status, await res.text().catch(() => ''))
  } catch (err) {
    return { estado: 'desconocido', status: null, mensaje: `No se pudo contactar con GitHub: ${err instanceof Error ? err.message : String(err)}` }
  }
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
