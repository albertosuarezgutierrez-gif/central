// Guardián de la UBICACIÓN del parking de House Sevillana. `node --test`.
//
// El parking NO está en el edificio de Calle Socorro 24: es una plaza de garaje privada en
// San Juan de la Palma, a pocos minutos a pie (Alberto, 27/09/2026). La web decía «en el
// propio/mismo edificio» en ES, EN e IT, en la portada, en /parking y en sus JSON-LD — o sea,
// una promesa falsa a quien reserva por el parking, que es el argumento nº 1 de la casa.
// Este test impide que la frase vuelva por cualquier vía: copy, traducciones, skill o i18n.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TERRITORIO = ['apps/housesevillana/', '.claude/skills/seo-house-sevillana/', 'apps/sivra/messages/']

/** Frases que sitúan el parking dentro de la casa, en los idiomas publicados. */
const FALSO =
  /mismo edificio|propio edificio|propio alojamiento|dentro del edificio|parking privado en el edificio|building itself|same building|inside the building|parking in the building|on-site|stesso edificio|nell.edificio|dentro l.edificio|edificio stesso|sur place|vor ort/i

function ficheros(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => TERRITORIO.some((t) => f.startsWith(t)))
    .filter((f) => /\.(ts|tsx|md|json)$/.test(f))
    .filter((f) => !f.endsWith('CLAUDE.md'))
}

test('hay ficheros que revisar (el recorrido no se ha quedado vacío)', () => {
  assert.ok(ficheros().length >= 10, `solo ${ficheros().length} ficheros: el filtro no mira donde debe`)
})

test('ningún texto sitúa el parking dentro del edificio de la casa', () => {
  const malos: string[] = []
  for (const f of ficheros()) {
    readFileSync(join(ROOT, f), 'utf8')
      .split('\n')
      .forEach((l, i) => {
        if (FALSO.test(l)) malos.push(`${f}:${i + 1}`)
      })
  }
  assert.deepEqual(malos, [], 'El parking está en San Juan de la Palma, no en el edificio')
})

test('la página /parking dice dónde está de verdad', () => {
  const html = readFileSync(join(ROOT, 'apps/housesevillana/app/parking/contenido.ts'), 'utf8')
  assert.match(html, /San Juan de la Palma/)
})
