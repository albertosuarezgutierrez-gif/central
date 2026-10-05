import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNAS_TITULAR, esquemaCompleto } from './esquema-titular-puro.ts'

test('sin la migración (columnas de hoy) → no aplicado', () => {
  assert.equal(esquemaCompleto([{ tabla: 'gastos', columna: 'propiedad' }, { tabla: 'sociedades', columna: 'cif' }]), false)
})

test('con TODAS las columnas → aplicado', () => {
  assert.equal(esquemaCompleto([...COLUMNAS_TITULAR]), true)
})

test('a medias (falta una cualquiera) → no aplicado', () => {
  for (let i = 0; i < COLUMNAS_TITULAR.length; i++) {
    const cols = COLUMNAS_TITULAR.filter((_, j) => j !== i)
    assert.equal(esquemaCompleto([...cols]), false, `falta ${COLUMNAS_TITULAR[i].tabla}.${COLUMNAS_TITULAR[i].columna}`)
  }
})

test('la columna de OTRA tabla no cuenta (estado en gastos ≠ sociedades.estado)', () => {
  const cols = COLUMNAS_TITULAR.map((c) => (c.columna === 'estado' ? { tabla: 'gastos', columna: 'estado' } : c))
  assert.equal(esquemaCompleto(cols), false)
})
