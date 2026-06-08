// Descarga las tipografías (woff2) a /public/fonts en el build, para servirlas
// AUTO-ALOJADAS y no cargar Google Fonts en runtime (no se transfiere la IP del
// visitante a terceros). Se ejecuta antes de `next build` (ver package.json).
//
//   - Nunito  → app (globals.css)
//   - DM Sans + Syne → manual público (public/manual.html)
//
// Dos fuentes de descarga, en cascada (resiliencia: gwfh suele dar 403/rate-limit):
//   1) google-webfonts-helper (gwfh.mranftl.com) — preferido (woff2 latin directo).
//   2) Fallback: la CSS2 API de Google (fonts.googleapis.com) → woff2 en
//      fonts.gstatic.com. SOLO en build: el .woff2 se guarda en public/fonts y se
//      sirve desde nuestro dominio, así que el visitante NUNCA contacta con Google
//      (su IP no se transfiere). Esto es lo que hace robusta la tipografía
//      corporativa aunque gwfh esté caído.
//
// Es DELIBERADAMENTE no crítico: si AMBAS fuentes fallan, avisa y termina con
// éxito → el build no se rompe y se degrada a la fuente del sistema (los
// font-family llevan fallback). Nunca deja la web peor que antes.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'public', 'fonts')
const timeout = (ms) => AbortSignal.timeout(ms)
// UA de navegador real → la CSS2 API de Google devuelve woff2 (con otro UA da ttf).
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// slug de google-webfonts-helper → { pesos (normal) que queremos, family de Google }
const FONTS = [
  { slug: 'nunito',  family: 'Nunito',  weights: ['300', '400', '500', '600', '700', '800', '900'] },
  { slug: 'dm-sans', family: 'DM Sans', weights: ['400', '500', '600', '700', '800'] },
  { slug: 'syne',    family: 'Syne',    weights: ['400', '700', '800'] },
]

// Fuente 1: google-webfonts-helper. Devuelve { peso: urlWoff2 } de los que encuentre.
async function urlsFromGwfh({ slug }) {
  const map = {}
  try {
    const res = await fetch(`https://gwfh.mranftl.com/api/fonts/${slug}?subsets=latin`, { signal: timeout(15000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const data = await res.json()
    for (const v of (data.variants || [])) {
      if (v.fontStyle === 'normal' && v.woff2) map[String(v.fontWeight)] = v.woff2
    }
  } catch (e) {
    console.warn(`[fetch-fonts] ${slug}: gwfh no disponible (${e.message}) — se prueba Google.`)
  }
  return map
}

// Fuente 2 (fallback): CSS2 API de Google → woff2 del subset latin.
async function urlsFromGoogle({ family, weights }) {
  const map = {}
  try {
    const q = `family=${encodeURIComponent(family)}:wght@${weights.join(';')}&display=swap`
    const res = await fetch(`https://fonts.googleapis.com/css2?${q}`, { headers: { 'User-Agent': UA }, signal: timeout(15000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const css = await res.text()
    // La CSS2 API emite bloques "/* subset */ @font-face {...}". Nos quedamos con
    // el del subset "latin" para cada peso.
    const blocks = css.split('/*').map((b) => '/*' + b)
    for (const b of blocks) {
      const subset = (b.match(/\/\*\s*([\w-]+)\s*\*\//) || [])[1]
      if (subset !== 'latin') continue
      const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1]
      const url = (b.match(/src:\s*url\(([^)]+\.woff2)\)/) || [])[1]
      if (weight && url && weights.includes(weight)) map[weight] = url
    }
  } catch (e) {
    console.warn(`[fetch-fonts] ${family}: Google CSS2 no disponible (${e.message}).`)
  }
  return map
}

async function fetchFamily(font) {
  const { slug, weights } = font
  // 1) gwfh; 2) Google para los pesos que falten.
  const urls = await urlsFromGwfh(font)
  const missing = weights.filter((w) => !urls[w])
  if (missing.length) Object.assign(urls, await urlsFromGoogle({ ...font, weights: missing }))

  let ok = 0
  for (const w of weights) {
    const url = urls[w]
    if (!url) { console.warn(`[fetch-fonts] ${slug}: sin fuente para el peso ${w}`); continue }
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: timeout(15000) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      await writeFile(join(OUT, `${slug}-${w}.woff2`), Buffer.from(await r.arrayBuffer()))
      ok++
    } catch (e) {
      console.warn(`[fetch-fonts] ${slug}: fallo al descargar el peso ${w}: ${e.message}`)
    }
  }
  console.log(`[fetch-fonts] ${slug}: ${ok}/${weights.length} pesos en public/fonts`)
  return ok
}

async function main() {
  await mkdir(OUT, { recursive: true })
  for (const f of FONTS) await fetchFamily(f)
}

// Nunca propaga error (no rompe el build).
main().catch((e) => console.warn('[fetch-fonts] error no crítico:', e?.message))
