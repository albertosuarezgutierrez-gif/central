// Guardián del filtro de descartados. Runner: node --test.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esGastoVigente, sqlGastoVigente } from './gasto-vigente.ts'

test('predicado tolerante al esquema: lee la columna vía to_jsonb (no rompe sin migración)', () => {
  assert.equal(sqlGastoVigente(), "(to_jsonb(gastos) ->> 'descartado_at') IS NULL")
  assert.equal(sqlGastoVigente('g'), "(to_jsonb(g) ->> 'descartado_at') IS NULL")
  assert.doesNotMatch(sqlGastoVigente(), /\bgastos\.descartado_at\b/, 'referenciar la columna directa rompe antes de la migración')
})

test('alias que no es un identificador → error (va a Prisma.raw)', () => {
  assert.throws(() => sqlGastoVigente("g) OR 1=1 --"))
  assert.throws(() => sqlGastoVigente(''))
})

test('en memoria: null/ausente = vigente; con fecha = descartado', () => {
  assert.equal(esGastoVigente({}), true)
  assert.equal(esGastoVigente({ descartado_at: null }), true)
  assert.equal(esGastoVigente({ descartado_at: '2026-10-04T10:00:00Z' }), false)
})

// Cada `FROM gastos` de los informes lleva su filtro: un duplicado descartado no suma.
for (const [fichero, esperados] of [['financiero.ts', 2], ['propiedades.ts', 7], ['conciliacion.ts', 1]] as const) {
  test(`${fichero}: todas sus lecturas de gastos excluyen descartados`, () => {
    const src = readFileSync(new URL(`./${fichero}`, import.meta.url), 'utf8')
    const lecturas = (src.match(/FROM gastos\b/g) ?? []).length
    const filtros = (src.match(/Prisma\.raw\(sqlGastoVigente\(\)\)/g) ?? []).length
    assert.equal(lecturas, esperados, `${fichero}: cambió el nº de lecturas de gastos; revisa el filtro`)
    assert.equal(filtros, lecturas, `${fichero}: ${lecturas} lecturas de gastos y ${filtros} filtros de vigentes`)
  })
}
