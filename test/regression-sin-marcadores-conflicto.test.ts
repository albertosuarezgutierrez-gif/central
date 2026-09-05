import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * 🚨 Ningún fichero versionado lleva marcadores de conflicto de git.
 *
 * ─── El caso que lo justifica (04/09/2026) ─────────────────────────────────
 * Un `git merge` dejó conflicto en `apps/asegura/lib/clientes-sin-canal.ts`, se
 * resolvió solo a medias y **el commit con los marcadores dentro se empujó y el
 * CI lo declaró VERDE**. Los 19 checks en `success`, `mergeable_state: clean`.
 *
 * Por qué no lo cazó nada de lo que ya había:
 *   · `tsc` — los marcadores cayeron DENTRO de un template literal de SQL, así
 *     que para TypeScript son una cadena perfectamente válida.
 *   · el guardián de esa pantalla — lee el fichero como TEXTO y comprueba que
 *     la consulta contiene ciertos patrones; seguían estando.
 *   · los tests — nadie ejecuta ese SQL (no hay BD en CI).
 * O sea: la consulta habría reventado en producción y todo estaba en verde.
 *
 * Y por qué se le pasó a quien mergeaba: leyó la salida del merge con
 * `| tail -10` y la del `grep` de marcadores con `| head`. **Las dos
 * truncaron justo la línea que importaba.** Es la misma familia de fallo que
 * vigila medio `CLAUDE.md`: dar por completa una salida recortada.
 *
 * Este guardián no depende de que nadie mire bien: pregunta a git por TODOS los
 * ficheros versionados y los abre.
 */

const RAIZ = new URL('..', import.meta.url).pathname

/** Solo al principio de línea: `=======` suelto aparece en tablas markdown y en
 *  subrayados de documentación, y un falso positivo diario se acaba ignorando. */
const MARCADORES = [/^<{7} /m, /^>{7} /m, /^\|{7}$/m]

/**
 * Ficheros que hablan DE los marcadores y por eso los contienen a propósito.
 * Lista explícita y corta: si crece, es que algo va mal.
 */
const EXENTOS = new Set([
  'scripts/resolver-conflicto-registro.mjs',
  'scripts/resolver-conflicto-registro.test.mjs',
  'test/regression-sin-marcadores-conflicto.test.ts',
])

/** Binarios y similares: abrirlos no aporta y ralentiza. */
const BINARIO = /\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|otf|mp4|mp3|xlsx?|docx?)$/i

function ficherosVersionados(): string[] {
  const salida = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, maxBuffer: 64 * 1024 * 1024 })
  return salida.toString('utf8').split('\0').filter(Boolean)
}

test('🚨 ningún fichero versionado contiene marcadores de conflicto de git', () => {
  const ficheros = ficherosVersionados()
  // Si `git ls-files` no devuelve nada, NO se declara el repo limpio: se falla.
  // Un guardián que se pone verde porque la consulta vino vacía es exactamente
  // el fallo más caro que hay (regla global de `CLAUDE.md`).
  assert.ok(ficheros.length > 100, `git ls-files devolvió ${ficheros.length} ficheros: no se ha podido comprobar`)

  const rotos: string[] = []
  for (const rel of ficheros) {
    if (EXENTOS.has(rel) || BINARIO.test(rel)) continue
    let texto: string
    try {
      texto = readFileSync(path.join(RAIZ, rel), 'utf8')
    } catch {
      continue // borrado en el índice o enlace roto: no es asunto de este test
    }
    if (MARCADORES.some((re) => re.test(texto))) rotos.push(rel)
  }

  assert.deepEqual(
    rotos,
    [],
    `Marcadores de conflicto sin resolver en:\n  ${rotos.join('\n  ')}\n` +
      'Un merge a medias pasa el typecheck si cae dentro de una cadena. Resuélvelo antes de commitear.',
  )
})
