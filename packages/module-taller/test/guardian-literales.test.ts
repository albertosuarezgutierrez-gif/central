// 🚨 GUARDIÁN (b): ni IVA ni €/h literales en la lógica. Decisión de Alberto (04/11/2026): todo lo que varía
// entre talleres es configuración; los valores de alta viven SOLO en src/defaults.ts.
// Se escanea el CÓDIGO (comentarios fuera; cadenas dentro) con los separadores numéricos `_` quitados,
// para que `2_100` no lo esquive. Visto fallar el 04/11/2026 plantando `* 0.21` y `= 21` en src/presupuesto.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, '..', 'src')
const PERMITIDO = 'defaults.ts'

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}
const normalizar = (codigo: string) => sinComentarios(codigo).replace(/(\d)_(?=\d)/g, '$1')

const NUM = (n: string) => new RegExp(`(?<![\\w.])${n.replace('.', '\\.')}(?![\\w.])`)
const PROHIBIDOS: Array<[string, RegExp]> = [
  ['IVA 21', NUM('21')],
  ['IVA 0.21', NUM('0.21')],
  ['IVA 1.21', NUM('1.21')],
  ['IVA 10', NUM('10')],
  ['IVA 0.1', /(?<![\w.])0\.10?(?![\w.])/],
  ['IVA 2100 pb', NUM('2100')],
  ['€/h 50', NUM('50')],
  ['€/h 5000 cént.', NUM('5000')],
]

function infracciones(codigo: string, re: RegExp): string[] {
  return normalizar(codigo).split('\n').filter((l) => re.test(l))
}

const ficheros = readdirSync(SRC).filter((f) => f.endsWith('.ts') && f !== PERMITIDO)

test('el cepo tiene qué vigilar (no pasa en vacío)', () => {
  assert.ok(ficheros.length >= 5, `solo ${ficheros.length} ficheros en src/`)
  assert.ok(readdirSync(SRC).includes(PERMITIDO))
})

test('el detector caza un literal plantado (autocomprobación del cepo)', () => {
  assert.ok(infracciones('const c = base * 0.21', PROHIBIDOS[1][1]).length === 1)
  assert.ok(infracciones('const iva = 2_100', PROHIBIDOS[5][1]).length === 1)
  assert.ok(infracciones('// 21 % en un comentario', PROHIBIDOS[0][1]).length === 0)
  assert.ok(infracciones('const x = 10000', PROHIBIDOS[3][1]).length === 0)
})

for (const [nombre, re] of PROHIBIDOS) {
  test(`sin literal «${nombre}» fuera de ${PERMITIDO}`, () => {
    const hallados = ficheros.flatMap((f) => infracciones(readFileSync(join(SRC, f), 'utf8'), re).map((l) => `${f}: ${l.trim()}`))
    assert.deepEqual(hallados, [])
  })
}
