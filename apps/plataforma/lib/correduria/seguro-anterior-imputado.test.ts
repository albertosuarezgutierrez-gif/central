import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparElegibles, describirCandidata, elegibles, leerSeguroAnteriorImputado } from './seguro-anterior-imputado.ts'

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
  assert.equal(describirCandidata(s.elegida!), 'MAPFRE · nº 5000000001 · turismo · desde 2023')
})

test('la etiqueta muestra el nº tal como se enviará (Mapfre sin sufijo de versión)', () => {
  assert.match(describirCandidata({ ...coche, numeroPoliza: '4840402030 01', codigoDgs: 'C0058' } as never), /nº 4840402030 ·/)
})

const pol = (id: string, fechaEfecto: string | null, extra: Record<string, unknown> = {}) => ({ id, origen: 'cartera', tipoVehiculo: 'turismo', compania: 'MAPFRE', numeroPoliza: '5000000001', fechaEfecto, faltan: [], ...extra })

test('agrupa: las del tomador primero, las del cónyuge aparte, cada grupo por antigüedad', () => {
  const s = leerSeguroAnteriorImputado({
    estado: 'imputado',
    elegida: pol('t-nueva', '2022-05-01'),
    alternativas: [pol('c-vieja', '2010-01-01', { delConyuge: 'Ana' }), pol('t-vieja', '2015-03-03'), pol('c-nueva', '2020-01-01', { delConyuge: 'Ana' }), pol('t-sinfecha', null)],
  })!
  const g = agruparElegibles(s)
  assert.deepEqual(g.propias.map((c) => c.id), ['t-vieja', 't-nueva', 't-sinfecha'])
  assert.deepEqual(g.conyuge.map((c) => c.id), ['c-vieja', 'c-nueva'])
  assert.equal(g.avisoSinPropias, null)
  assert.match(describirCandidata(g.conyuge[0]), /desde 2010 · del cónyuge: Ana$/)
})

test('sin pólizas propias y con las del cónyuge: aviso; sin ninguna de las dos, no', () => {
  const s = leerSeguroAnteriorImputado({ estado: 'ninguno', elegida: null, alternativas: [pol('c1', '2018-01-01', { delConyuge: 'Ana' })] })!
  const g = agruparElegibles(s)
  assert.deepEqual(g.propias, [])
  assert.equal(g.avisoSinPropias, 'Sin seguro anterior propio; puedes usar el del cónyuge si la compañía lo admite')
  assert.equal(agruparElegibles(leerSeguroAnteriorImputado({ estado: 'ninguno' })!).avisoSinPropias, null)
  // una propia incompleta (no declarable) NO es «sin seguro propio»
  const inc = leerSeguroAnteriorImputado({ estado: 'ninguno', alternativas: [pol('t1', null, { faltan: ['numeroPoliza'] }), pol('c1', '2018-01-01', { delConyuge: 'Ana' })] })!
  assert.equal(agruparElegibles(inc).avisoSinPropias, null)
})

test('cónyuge no mirado: el indicador se lee solo con true explícito', () => {
  assert.equal(leerSeguroAnteriorImputado({ estado: 'ninguno', conyugeNoMirado: true })?.conyugeNoMirado, true)
  assert.equal(leerSeguroAnteriorImputado({ estado: 'ninguno' })?.conyugeNoMirado, false)
})
