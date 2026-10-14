import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo, ramosConBots } from './tarificador-bots-ramos.ts'

test('ramo sin adaptador (o raro) → null', () => {
  for (const r of ['hogar', 'vida', 'salud', 'decesos', 'comunidades', 'AUTO', '', 'toString', '__proto__', null, undefined]) {
    assert.equal(adaptadorDeRamo(r as string | null | undefined), null, String(r))
  }
})

test('moto → adaptador con cilindrada editable; sin ella faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('moto')
  assert.ok(a)
  assert.equal(a.ramo, 'moto')
  assert.deepEqual(a.campos.map((c) => c.clave), ['cilindrada'])
  assert.ok(ramosConBots().includes('moto'))
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: null, fechaNacimiento: null, fechaCarne: null,
    sexo: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, { cilindrada: '' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.faltan.some((f) => /Cilindrada/.test(f)))
})

test('lista de ramos con bots fijada: moto y auto (coche, Mapfre NSEI, 14/10/2026)', () => {
  assert.deepEqual(ramosConBots().sort(), ['auto', 'moto'])
})

test('auto → adaptador sin campos extra; sin historial ni matrícula faltan datos y lo dice sin valores', () => {
  const a = adaptadorDeRamo('auto')
  assert.ok(a)
  assert.equal(a.ramo, 'auto')
  assert.deepEqual(a.campos, [])
  const r = a.construir({
    matricula: '', marca: null, modelo: null, version: null, codigoPostal: 'ficha', fechaNacimiento: 'ficha', fechaCarne: 'ficha',
    sexo: null, garaje: null, conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: false,
    aniosAsegurado: '', aniosSinSiniestros: '', siniestrosUltimos5: '',
  }, {})
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.faltan.some((f) => /Matrícula/.test(f)))
    assert.ok(r.faltan.some((f) => /Seguro actual/.test(f)))
  }
})
