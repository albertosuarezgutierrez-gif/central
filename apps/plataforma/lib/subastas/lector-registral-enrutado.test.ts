import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ────────────────────────────────────────────────────────────────────────────
// Guardián del ENRUTADO del lector registral (lee el FUENTE, como
// cols-subasta.test.ts: la pasarela no es importable desde `node --test`).
//
// El bug que fija (medido en producción, 24/08/2026): `leerTexto` resolvía el
// modelo de la categoría `registral` fuera de la pasarela y lo pasaba como
// `modelo`. En `chatConDirector`, `modelo` es el PIN que SALTA OpenRouter y se
// fija también en la cadena clásica — así que el id del catálogo
// (`google/gemini-2.5-flash`, un id de OpenRouter) acababa en el API de NVIDIA
// («NVIDIA HTTP 404») y el lector de TEXTO estaba muerto: toda certificación o
// edicto con capa de texto salía «ilegible». Ni `tsc` ni el build lo cazan
// (ambos parámetros son strings válidos).
// ────────────────────────────────────────────────────────────────────────────

const fuente = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'lector-registral.ts'),
  'utf8',
)

test('leerTexto pide el modelo por categoria, nunca con el pin `modelo`', () => {
  const desde = fuente.indexOf('chatConDirector(')
  assert.ok(desde > 0, 'leerTexto debe seguir llamando a chatConDirector')
  const llamada = fuente.slice(desde, fuente.indexOf('normalizarCuadroCargas', desde))

  assert.match(llamada, /categoria:\s*'registral'/, 'la llamada debe llevar categoria: \'registral\'')
  // Un `modelo:` (o el shorthand `modelo,`) en esta llamada es el pin que manda
  // el id de OpenRouter a NIM: exactamente el 404 que este test existe para vetar.
  assert.doesNotMatch(llamada, /\bmodelo\s*[,:]/, 'la llamada NO puede pinnear `modelo` (saltaría OpenRouter)')
})
