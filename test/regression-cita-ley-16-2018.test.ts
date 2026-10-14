// Guardián: la «Ley 16/2018» de distribución de seguros NUNCA se promulgó (fue
// un proyecto de ley). La norma vigente es el Real Decreto-ley 3/2020, libro I,
// título II (art. 173 información previa, art. 175.1 exigencias y necesidades,
// art. 157.1.g RC profesional). Citarla en un texto legal es información falsa.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const APPS = ['apps/asegura-web', 'apps/plataforma']
const IGNORAR = new Set(['node_modules', '.next', '.vercel', '.turbo'])
const EXT = /\.(ts|tsx|js|jsx|mjs|md|mdx|json|html|css)$/

function* ficheros(dir: string): Generator<string> {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.has(nombre)) continue
    const ruta = join(dir, nombre)
    const st = statSync(ruta)
    if (st.isDirectory()) yield* ficheros(ruta)
    else if (EXT.test(nombre)) yield ruta
  }
}

test('ningún texto de asegura-web ni plataforma cita la inexistente «Ley 16/2018»', () => {
  const culpables: string[] = []
  for (const app of APPS) {
    for (const f of ficheros(join(RAIZ, app))) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (l.includes('16/' + '2018')) culpables.push(`${f.slice(RAIZ.length + 1)}:${i + 1}`)
      })
    }
  }
  assert.deepEqual(culpables, [], 'Cita la norma vigente: Real Decreto-ley 3/2020 (art. 173, 175.1, 157.1.g)')
})
