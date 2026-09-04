// Guardián del nombre comercial de la correduría. `node --test` (gate en `pnpm test:guardia`).
//
// El nombre comercial es **«Grupo ASegura»**, con A y S mayúsculas: el monograma «AS» del
// logo ES el nombre (A de Alberto, S de Suárez), así que escribirlo «Grupo Asegura» no es
// una errata de estilo — se come la marca. Dictado por Alberto el 04/09/2026, después de
// verlo mal escrito en la cabecera del portal del cliente (`Mis seguros`), que es la única
// pantalla que ve un asegurado.
//
// Por qué hace falta un test y no basta con corregirlo: el autocorrector de cualquier editor
// —y el de cualquiera que escriba el nombre de memoria— lo «arregla» a `Asegura` solo, y el
// fallo entra por 56 ficheros distintos (UI, emails, textos de consentimiento, skills, docs).
// Aquí se ve en un comando; en una pantalla, solo cuando lo ve un cliente.
//
// El valor canónico en BD (`seguros.corredurias.nombre`) ya es «Grupo ASegura»: esto impide
// que el código vuelva a contradecir a la fila.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** La grafía buena, y la única. */
export const NOMBRE_COMERCIAL = 'Grupo ASegura'

/** Este fichero tiene que poder nombrar las grafías malas para explicarlas. */
const EXENTOS = ['test/regression-nombre-comercial-asegura.test.ts']

/** Solo ficheros de texto donde el nombre se escribe de verdad. */
const EXTENSIONES = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|svg|sql|html|txt|yml|yaml|prisma)$/

/** «Grupo» + separador + «asegura» en cualquier caja. Lo que se compara luego es la caja. */
const PATRON = /Grupo[\s ]+Asegura/gi

function ficherosVersionados(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => EXTENSIONES.test(f))
    .filter((f) => !EXENTOS.includes(f))
}

test('el nombre comercial se escribe SIEMPRE «Grupo ASegura»', () => {
  const malos: string[] = []

  for (const rel of ficherosVersionados()) {
    const abs = join(ROOT, rel)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      continue // fichero borrado en el índice: no es asunto de este test
    }
    if (!stat.isFile() || stat.size > 2_000_000) continue

    const texto = readFileSync(abs, 'utf8')
    const lineas = texto.split('\n')
    lineas.forEach((linea, i) => {
      for (const m of linea.matchAll(PATRON)) {
        if (m[0] !== NOMBRE_COMERCIAL) malos.push(`${rel}:${i + 1}  «${m[0]}»`)
      }
    })
  }

  assert.deepEqual(
    malos,
    [],
    `El nombre comercial es «${NOMBRE_COMERCIAL}» (A y S mayúsculas: el monograma «AS» del ` +
      `logo es el nombre). Escrito mal en:\n  ${malos.join('\n  ')}`,
  )
})
