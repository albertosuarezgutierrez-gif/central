// Envío por LOTES a un puerto interno de plataforma (/api/internal/*), compartido por
// scripts/mapa-arquitectura-inyectar.mjs y scripts/grafo-codigo-inyectar.mjs.
//
// Por qué existe (12/09/2026): Vercel corta el body de una función en ~4,5 MB (413
// FUNCTION_PAYLOAD_TOO_LARGE). El mapa de funciones (docs/mapa-funciones.generated.json) se
// mandaba ENTERO en un solo POST y llevaba meses creciendo hasta 4.492.854 bytes: el PR #2807 le
// añadió un kilobyte y el paso del workflow murió con 413 seis veces seguidas — y como el paso del
// grafo venía detrás, se saltó. Un tope que se cruza por un kilobyte no se arregla apretando el
// JSON: se parte en lotes de tamaño acotado, como ya hacía el grafo.
//
// Contrato del puerto: cada POST lleva { sha, lote, total, ...filas }; el último lote (lote ===
// total) es el que borra lo que ya no existe (por `sha`), así nunca hay una ventana con la tabla
// vacía. Reintentos: 6 por lote con espera intento*15 s (el push a main que dispara el workflow
// puede estar redesplegando plataforma → 404/5xx transitorios). Un 401 NO se reintenta.
// Lógica pura (partirEnLotes) exportada para test/inyectar-lotes.test.ts.

/** Tamaño máximo de un lote en bytes, holgado frente al corte de ~4,5 MB de Vercel. */
export const MAX_BYTES_LOTE = 1_000_000

/**
 * Parte `filas` en lotes cuyo JSON no supere `maxBytes` (medido como JSON.stringify de cada fila
 * + separadores). Una fila que por sí sola supere el tope va en su propio lote: se envía igual y
 * será el puerto quien la rechace, no este script el que la pierda en silencio.
 */
export function partirEnLotes(filas, maxBytes = MAX_BYTES_LOTE) {
  const lotes = []
  let actual = []
  let bytes = 0
  for (const fila of filas) {
    const b = Buffer.byteLength(JSON.stringify(fila), 'utf8') + 1
    if (actual.length && bytes + b > maxBytes) {
      lotes.push(actual)
      actual = []
      bytes = 0
    }
    actual.push(fila)
    bytes += b
  }
  if (actual.length) lotes.push(actual)
  return lotes
}

/** Espera `s` segundos (inyectable en test). */
const dormir = (s) => new Promise(r => setTimeout(r, s * 1000))

/**
 * Envía los lotes en orden. `construirBody(lote, i)` devuelve el objeto a serializar SIN sha/lote/total
 * (se añaden aquí). Devuelve true si todos entraron; false si alguno falló tras los reintentos.
 * `fetchImpl`/`esperar` son inyectables para test.
 */
export async function enviarLotes({ url, secret, sha, lotes, construirBody, etiqueta = 'lote', fetchImpl = fetch, esperar = dormir, log = console }) {
  const total = lotes.length
  for (let i = 0; i < total; i++) {
    const n = i + 1
    let ok = false
    for (let intento = 1; intento <= 6; intento++) {
      let codigo = 0
      let detalle = ''
      try {
        const resp = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha, lote: n, total, ...construirBody(lotes[i], i) }),
        })
        codigo = resp.status
        if (codigo === 200) { ok = true; break }
        detalle = (await resp.text().catch(() => '')).slice(0, 200)
      } catch (e) {
        detalle = e instanceof Error ? e.message : String(e)
      }
      if (codigo === 401) {
        log.error(`${etiqueta} ${n}/${total}: HTTP 401 — CRON_SECRET no coincide con Vercel. No se reintenta.`)
        break
      }
      if (intento < 6) {
        log.log(`${etiqueta} ${n}/${total}: ${codigo ? `HTTP ${codigo}` : 'sin respuesta'} ${detalle}. Reintento en ${intento * 15}s…`)
        await esperar(intento * 15)
      } else {
        log.error(`${etiqueta} ${n}/${total}: ${codigo ? `HTTP ${codigo}` : 'sin respuesta'} tras 6 intentos. ${detalle}`)
      }
    }
    if (!ok) return false
    log.log(`${etiqueta} ${n}/${total} inyectado.`)
  }
  return true
}

/** Envs comunes; devuelve null (y lo dice) si faltan — el workflow no debe fallar por eso. */
export function leerEnvs(env = process.env) {
  const PLATAFORMA_URL = env.PLATAFORMA_URL || ''
  const CRON_SECRET = env.CRON_SECRET || ''
  if (!PLATAFORMA_URL || !CRON_SECRET) {
    console.log('PLATAFORMA_URL/CRON_SECRET no configurados — se omite la inyección.')
    return null
  }
  return { PLATAFORMA_URL, CRON_SECRET }
}
