// Guardián del barrido de ramas de la radiografía. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// EL FALLO QUE PREVIENE (medido 01/09/2026): `.github/workflows/auditoria.yml` estrena una rama
// `claude/auditoria-radiografia-<run_id>` en CADA pasada, y solo borraba la rama de los PRs que
// encontraba ABIERTOS. Pero el camino normal es que `rutinas-automerge.yml` MERGEE el PR, y al
// mergear no lo borra nadie: se habían acumulado 125 ramas huérfanas en el remoto.
//
// El barrido que lo arregla tiene un riesgo obvio y peor que el problema: borrar la rama de un PR
// que sigue vivo, o la de la pasada en curso, deja el PR sin head y sin forma de mergearse. Por eso
// el filtro vive en una función bash aislada y este test la ejecuta TAL CUAL sale del YAML —
// reimplementarla en JS haría que el test pasara mientras el workflow borra lo que no debe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/auditoria.yml'

/** Extrae `ramas_a_borrar()` del YAML, sin la indentación del bloque `run:`. */
function funcionBash(): string {
  const yaml = readFileSync(join(ROOT, WORKFLOW), 'utf8')
  const desde = yaml.indexOf('ramas_a_borrar() {')
  assert.notEqual(desde, -1, `${WORKFLOW} ya no define ramas_a_borrar(): el barrido se ha perdido`)
  const hasta = yaml.indexOf('\n          }\n', desde)
  assert.notEqual(hasta, -1, 'ramas_a_borrar() sin cierre reconocible')
  return yaml
    .slice(desde, hasta + '\n          }\n'.length)
    .split('\n')
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n')
}

/** Ejecuta el filtro real con las ramas remotas dadas. */
function borrar(remotas: string[], actual: string, vivas: string[]): string[] {
  const guion = `${funcionBash()}\nprintf '%s\\n' "\$1" | ramas_a_borrar "\$2" "\$3"\n`
  const salida = execFileSync('bash', ['-e', '-c', guion, 'bash', remotas.join('\n'), actual, vivas.join('\n')], {
    encoding: 'utf8',
  })
  return salida.split('\n').filter(Boolean)
}

const ACTUAL = 'claude/auditoria-radiografia-999'
const VIEJA_1 = 'claude/auditoria-radiografia-111'
const VIEJA_2 = 'claude/auditoria-radiografia-222'
const CON_PR = 'claude/auditoria-radiografia-333'

test('borra las ramas que ya no sostienen ningún PR abierto', () => {
  assert.deepEqual(borrar([VIEJA_1, VIEJA_2, ACTUAL], ACTUAL, []), [VIEJA_1, VIEJA_2])
})

test('NUNCA borra la rama de la pasada en curso: dejaría su propio PR sin head', () => {
  assert.equal(borrar([ACTUAL], ACTUAL, []).length, 0)
})

test('NUNCA borra la rama de un PR que sigue abierto', () => {
  assert.deepEqual(borrar([VIEJA_1, CON_PR, ACTUAL], ACTUAL, [CON_PR]), [VIEJA_1])
})

test('un PR abierto de OTRA rutina no salva a una rama de radiografía homónima parcial', () => {
  // `grep -qxF` compara la línea entera: «…-1110» no debe leerse como «…-111».
  assert.deepEqual(borrar([VIEJA_1], ACTUAL, ['claude/auditoria-radiografia-1110']), [VIEJA_1])
})

test('sin ramas remotas no devuelve nada (y no revienta con la lista vacía)', () => {
  assert.equal(borrar([], ACTUAL, []).length, 0)
})
