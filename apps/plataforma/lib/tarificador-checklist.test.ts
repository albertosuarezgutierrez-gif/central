import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeChecklist, checklistCompania, resumenFilas } from './tarificador-checklist.ts'

const AUTO = {
  ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' },
  tomadorEsConductor: true, aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0, companiaAnterior: 'Línea Directa',
}

test('compañía sin declaración o ramo sin validador → no_disponible (nunca «todo ok»)', () => {
  for (const [c, r] of [['zurich', 'auto'], ['mapfre', 'vida'], ['', 'auto']] as const) {
    const x = checklistCompania(c, r, AUTO)
    assert.equal(x.estado, 'no_disponible', `${c}/${r}`)
    assert.ok(avisoDeChecklist(x))
  }
})

test('Mapfre auto completo: ✓ lo que está, los datos del tomador "de la ficha" no bloquean', () => {
  const x = checklistCompania('mapfre', 'auto', AUTO)
  assert.ok(x.estado === 'evaluado')
  assert.equal(x.bloquea, false)
  assert.equal(avisoDeChecklist(x), null)
  assert.equal(x.filas.find((f) => f.clave === 'matricula')?.estado, 'ok')
  assert.equal(x.filas.find((f) => f.clave === 'documentoTomador')?.estado, 'ficha')
  assert.ok(x.deFicha >= 1)
  assert.match(resumenFilas(x), /datos listos · \d+ de la ficha/)
})

test('Mapfre auto sin compañía anterior ni carné: ✗ con etiqueta y mensaje «Faltan: …»; sin valores', () => {
  const r = { ...AUTO, companiaAnterior: undefined, conductor: { fechaNacimiento: '1980-05-17' } }
  const x = checklistCompania('mapfre', 'auto', r)
  assert.ok(x.estado === 'evaluado' && x.bloquea)
  assert.deepEqual(x.faltan.map((f) => f.clave).sort(), ['companiaAnterior', 'conductor.fechaCarne'])
  assert.match(avisoDeChecklist(x)!, /^Faltan: .*fecha del carné.*nombre de la compañía anterior/)
  assert.ok(!JSON.stringify(x).includes('1980-05-17'), 'ningún valor en el checklist')
  assert.equal(x.filas.find((f) => f.clave === 'conductor.fechaNacimiento')?.estado, 'ok')
})

test('lo que el adaptador deja a la ficha (completarDesdeFicha) cuenta como «ficha», no como falta', () => {
  const r = { ...AUTO, codigoPostal: undefined, conductor: {} }
  const sin = checklistCompania('allianz', 'auto', r)
  assert.ok(sin.estado === 'evaluado' && sin.bloquea && sin.faltan.length === 3)
  const con = checklistCompania('allianz', 'auto', r, ['codigoPostal', 'fechaNacimiento', 'fechaCarne'])
  assert.ok(con.estado === 'evaluado' && !con.bloquea)
  assert.deepEqual(con.filas.filter((f) => f.estado === 'ficha').map((f) => f.clave).sort(), ['codigoPostal', 'conductor.fechaCarne', 'conductor.fechaNacimiento'])
})

test('Allianz moto exige sexo y clase aunque el formulario de moto no los pidiera (0 y false son datos)', () => {
  const moto = {
    ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: null },
    aniosAseguradoAnterior: 0, siniestrosUltimos5Anios: 0, seleccionVehiculo: { marca: 'Honda', modelo: 'PCX', clase: 1, cilindradaCc: 125 },
  }
  const x = checklistCompania('allianz', 'moto', moto)
  assert.ok(x.estado === 'evaluado' && x.bloquea)
  assert.deepEqual(x.faltan.map((f) => f.clave), ['conductor.sexo'])
  const ok = checklistCompania('allianz', 'moto', { ...moto, conductor: { ...moto.conductor, sexo: 'hombre' } })
  assert.ok(ok.estado === 'evaluado' && !ok.bloquea)
})
