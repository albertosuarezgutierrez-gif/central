import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptadorDeRamo, ramosConBots } from './tarificador-bots-ramos.ts'

test('ramo sin adaptador (o raro) → null', () => {
  for (const r of ['hogar', 'auto', 'vida', 'salud', 'decesos', '', 'toString', '__proto__', null, undefined]) {
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
