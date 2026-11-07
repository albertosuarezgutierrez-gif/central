// Guardián `regression-nominas-sin-float` (nóminas N1). `node --test` (gate en `pnpm test:guardia`).
//
// El motor de nóminas trabaja en CÉNTIMOS ENTEROS y ppm (packages/module-nominas/src/dinero.ts). La forma clásica de
// romperlo es volver a multiplicar un importe en euros float por 100 (`Math.round(euros * 100)`: 1,005 × 100 = 100,4999…)
// o formatear con `toFixed` dentro del cálculo. Este guardián prohíbe, en el código NO-test de module-nominas y en los
// ficheros de nóminas/contratos de apps/rrhh:
//   · `x * 100` / `100 * x` (la única conversión permitida es `eurosACentimos`, con `toPrecision(15)`, en dinero.ts);
//   · `.toFixed(` en module-nominas (los importes no se redondean a cadena dentro del cálculo).
// Y exige que los entradas del motor sigan validando enteros (`esCentimos`).
//
// Comentarios y cadenas se ignoran. Un uso legítimo nuevo se añade a PERMITIDO con motivo, no se esquiva.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')

/** Quita comentarios (// y /* *​/) y literales de cadena/plantilla para no dar falsos positivos. */
export function limpiar(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""')
}

const POR_100 = /(?<![\d_.])100\s*\*(?!\*)|(?<![*])\*\s*100(?![\d_.%])/
const TO_FIXED = /\.toFixed\s*\(/

/** Líneas problemáticas de un fuente (número de línea y texto). */
export function violaciones(src: string, opts: { toFixed: boolean; permitido?: RegExp }): string[] {
  const out: string[] = []
  limpiar(src).split('\n').forEach((l, i) => {
    if (opts.permitido?.test(l)) return
    if (POR_100.test(l)) out.push(`L${i + 1}: producto por 100 → ${l.trim()}`)
    if (opts.toFixed && TO_FIXED.test(l)) out.push(`L${i + 1}: toFixed → ${l.trim()}`)
  })
  return out
}

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    if (n === 'node_modules' || n === '.next') return []
    const p = join(dir, n)
    return statSync(p).isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.|\.d\.ts$/.test(n) ? [p] : []
  })
}

// La ÚNICA conversión euros→céntimos permitida: eurosACentimos (toPrecision evita 1,005 × 100 = 100,4999…).
const PERMITIDO_DINERO = /toPrecision\(15\)/

const FUENTES_MODULO = listar(join(RAIZ, 'packages/module-nominas/src'))
const FUENTES_RRHH = listar(join(RAIZ, 'apps/rrhh')).filter(p => /nomina|contrato/i.test(relative(join(RAIZ, 'apps/rrhh'), p)))

test('hay fuentes que vigilar (el guardián no se queda ciego si mueven carpetas)', () => {
  assert.ok(FUENTES_MODULO.length >= 10, `module-nominas: ${FUENTES_MODULO.length} ficheros`)
  assert.ok(FUENTES_RRHH.length >= 3, `rrhh nóminas/contratos: ${FUENTES_RRHH.length} ficheros`)
})

test('module-nominas: ningún `* 100` sobre euros ni toFixed (salvo eurosACentimos con toPrecision)', () => {
  const malas: string[] = []
  for (const f of FUENTES_MODULO) {
    const permitido = f.endsWith('/dinero.ts') ? PERMITIDO_DINERO : undefined
    for (const v of violaciones(readFileSync(f, 'utf8'), { toFixed: true, permitido })) malas.push(`${relative(RAIZ, f)} ${v}`)
  }
  assert.deepEqual(malas, [])
})

test('apps/rrhh (nóminas y contratos): ningún `* 100` sobre euros float', () => {
  const malas: string[] = []
  for (const f of FUENTES_RRHH) for (const v of violaciones(readFileSync(f, 'utf8'), { toFixed: false })) malas.push(`${relative(RAIZ, f)} ${v}`)
  assert.deepEqual(malas, [])
})

test('el motor y el IRPF siguen exigiendo céntimos enteros (esCentimos) y no aceptan float', () => {
  for (const f of ['motor.ts', 'irpf.ts', 'embargo.ts', 'atrasos.ts']) {
    const src = readFileSync(join(RAIZ, 'packages/module-nominas/src', f), 'utf8')
    assert.match(src, /esCentimos\(/, `${f} debe validar con esCentimos`)
  }
  const dinero = readFileSync(join(RAIZ, 'packages/module-nominas/src/dinero.ts'), 'utf8')
  assert.match(dinero, /toPrecision\(15\)/, 'eurosACentimos debe seguir usando toPrecision(15)')
})

test('el detector detecta lo que debe (y no da falsos positivos con comentarios, cadenas, ppm ni 1000)', () => {
  const o = { toFixed: true }
  assert.equal(violaciones('const c = Math.round(euros * 100)', o).length, 1)
  assert.equal(violaciones('const c = Math.round(euros*100)', o).length, 1)
  assert.equal(violaciones('const c = 100 * euros', o).length, 1)
  assert.equal(violaciones('const s = importe.toFixed(2)', o).length, 1)
  assert.equal(violaciones('// euros * 100\nconst a = 1', o).length, 0)
  assert.equal(violaciones('/* x * 100 */ const a = 1', o).length, 0)
  assert.equal(violaciones('const a = "x * 100"', o).length, 0)
  assert.equal(violaciones('const ms = 15 * 60 * 1000', o).length, 0)
  assert.equal(violaciones('const p = x * 1_000_000', o).length, 0)
  assert.equal(violaciones('const r = (a * j) / 100', o).length, 0)
  assert.equal(violaciones('const w = calc(<alpha-value> * 100%)', { toFixed: false }).length, 0)
})
