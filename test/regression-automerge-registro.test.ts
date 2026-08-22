// Guardián del automerge de rutinas. `node --test` (gate en CI vía `pnpm test:guardia`).
//
// EL FALLO QUE PREVIENE (detectado 21/08/2026): `.github/workflows/rutinas-automerge.yml`
// mergea solo los PRs cuyo diff toca ÚNICAMENTE ficheros de registro, y decide qué es
// "registro" con la función bash `es_registro()`. Los ficheros de ESTADO de los agentes
// programados (docs/VIGIA-OSS.md, docs/BUSCADOR-IA.md, docs/FISCAL-AYUDAS.md) son registro
// puro —cuentan lo que el agente vio— pero nadie los añadió a esa lista. Resultado: sus PRs
// caen en carril 2 y esperan ojo humano para nada, hasta pudrirse en conflicto (el mismo
// fallo de los cinco PRs muertos del 04-07/08/2026, repetido en las tres rutinas a las que
// nadie miró).
//
// Arreglarlo a mano no basta: nada impide que el PRÓXIMO vigía nazca con el mismo defecto.
// Este test declara los ficheros de estado y comprueba que el workflow los reconoce.
//
// Se ejecuta la función bash REAL extraída del YAML. Reimplementar su `case` en JS haría
// que el test pasara mientras el workflow falla — exactamente lo que queremos evitar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const WORKFLOW = '.github/workflows/rutinas-automerge.yml'

// Ficheros de ESTADO de agentes programados: los escribe el agente para contar lo que vio.
// Al dar de alta un agente con fichero de estado propio, añádelo aquí Y a es_registro().
const ESTADO_DE_AGENTES = [
  'docs/VIGIA-OSS.md',        // github-vigia
  'docs/BUSCADOR-IA.md',      // buscador-ia
  'docs/FISCAL-AYUDAS.md',    // fiscal-novedades
  'docs/VIGIA-CONECTORES.md', // conectores-vigia
]

// Ficheros que NUNCA deben colarse como registro: le dicen a un agente qué hacer.
const NUNCA_REGISTRO = [
  '.claude/skills/conectores-vigia/SKILL.md',
  'docs/SKILLS.md',
  'docs/RUTINAS-PROGRAMADAS.md',
  'docs/FUENTES-DE-VERDAD.md',
  'CLAUDE.md',
  'docs/HUECOS-ABIERTOS.md',  // catálogo de decisiones, no registro de lo que pasó
  '.github/workflows/rutinas-automerge.yml',
  'apps/plataforma/lib/dinero.ts',
]

/** Extrae el cuerpo de `es_registro() { ... }` tal cual está en el YAML. */
function extraerFuncion(): string {
  const yaml = readFileSync(join(ROOT, WORKFLOW), 'utf8')
  const m = /^(\s*)es_registro\(\) \{\n([\s\S]*?)\n\1\}$/m.exec(yaml)
  assert.ok(m, `no se encontró es_registro() en ${WORKFLOW} — ¿la han renombrado o reindentado?`)
  return `es_registro() {\n${m[2]}\n}`
}

/** Corre la función bash real contra una ruta. true = la reconoce como registro. */
function esRegistro(ruta: string): boolean {
  const script = `${extraerFuncion()}\nif es_registro "$1"; then echo SI; else echo NO; fi`
  const out = execFileSync('bash', ['-c', script, '--', ruta], { encoding: 'utf8' })
  return out.trim() === 'SI'
}

test('el automerge reconoce los ficheros de estado de los agentes programados', () => {
  const invisibles = ESTADO_DE_AGENTES.filter((f) => !esRegistro(f))

  assert.deepEqual(
    invisibles,
    [],
    'Estos ficheros de estado NO los reconoce es_registro(), así que el PR de esa rutina ' +
      'esperará ojo humano para un cambio que es puro registro, y se pudrirá en conflicto. ' +
      `Añádelos al case de es_registro() en ${WORKFLOW}.`,
  )
})

test('el automerge NO reconoce como registro lo que dice a un agente qué hacer', () => {
  const colados = NUNCA_REGISTRO.filter((f) => esRegistro(f))

  assert.deepEqual(
    colados,
    [],
    'Estos ficheros cambian el COMPORTAMIENTO de un agente o del repo y se estarían ' +
      'auto-mergeando sin que nadie los mire. Sácalos del case de es_registro().',
  )
})
