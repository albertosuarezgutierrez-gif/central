import test from 'node:test'
import assert from 'node:assert/strict'
import { describirCandidata, elegibles, leerSeguroAnteriorImputado } from './seguro-anterior-imputado.ts'

const coche = { id: 'poliza:a', origen: 'cartera', tipoVehiculo: 'turismo', compania: 'MAPFRE', numeroPoliza: '5000000001', fechaEfecto: '2023-10-10', faltan: [] }
const sinNum = { id: 'oportunidad:b', origen: 'competencia', tipoVehiculo: 'moto', compania: 'AXA', faltan: ['numeroPoliza'] }

test('lee lo imputado; el bonus solo es «no supuesto» con un false explícito', () => {
  const s = leerSeguroAnteriorImputado({ estado: 'imputado', elegida: coche, porque: 'x', alternativas: [sinNum], avisos: ['a'], bonusSupuesto: true, condicion: 'Bonus supuesto' })
  assert.equal(s?.elegida?.id, 'poliza:a')
  assert.equal(s?.bonusSupuesto, true)
  assert.equal(leerSeguroAnteriorImputado({ estado: 'imputado', elegida: coche })?.bonusSupuesto, true, 'sin el campo: supuesto (fail-closed)')
  assert.equal(leerSeguroAnteriorImputado({ estado: 'ninguno', bonusSupuesto: false })?.bonusSupuesto, false)
  assert.equal(leerSeguroAnteriorImputado(undefined), null, 'no vino ≠ no tiene')
  assert.equal(leerSeguroAnteriorImputado({ estado: 'raro' }), null)
})

test('solo se ofrecen las declarables; la descripción no enseña el nº entero', () => {
  const s = leerSeguroAnteriorImputado({ estado: 'imputado', elegida: coche, alternativas: [sinNum] })!
  assert.deepEqual(elegibles(s).map((c) => c.id), ['poliza:a'])
  assert.equal(describirCandidata(s.elegida!), 'MAPFRE · nº 5000000001 · turismo · efecto 2023-10-10')
})

test('la etiqueta muestra el nº tal como se enviará (Mapfre sin sufijo de versión)', () => {
  assert.match(describirCandidata({ ...coche, numeroPoliza: '4840402030 01', codigoDgs: 'C0058' } as never), /nº 4840402030 ·/)
})
