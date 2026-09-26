import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CADUCA_MS, claveBorrador, leerBorrador, merecePena } from './parte-borrador.ts'

const PLANTILLA = {
  descripcion: '',
  fechaHecho: '',
  lugar: '',
  poliza: '',
  hayHeridos: 'nolose',
  vehiculo: { matriculaPropia: '', zonasDano: [] as string[] },
}
const AHORA = 1_800_000_000_000

test('la clave lleva la identidad: dos personas en el mismo móvil no comparten borrador', () => {
  assert.notEqual(claveBorrador('a'), claveBorrador('b'))
})

test('un borrador válido se recupera con sus datos', () => {
  const bruto = JSON.stringify({
    guardadoEn: AHORA - 1000,
    form: { ...PLANTILLA, descripcion: 'tubería', vehiculo: { matriculaPropia: '1234ABC', zonasDano: ['delantera'] } },
  })
  const b = leerBorrador(bruto, PLANTILLA, AHORA)
  assert.equal(b?.form.descripcion, 'tubería')
  assert.deepEqual(b?.form.vehiculo, { matriculaPropia: '1234ABC', zonasDano: ['delantera'] })
})

test('caducado, del futuro o ilegible → null', () => {
  const viejo = JSON.stringify({ guardadoEn: AHORA - CADUCA_MS - 1, form: PLANTILLA })
  assert.equal(leerBorrador(viejo, PLANTILLA, AHORA), null)
  const futuro = JSON.stringify({ guardadoEn: AHORA + 3_600_000, form: PLANTILLA })
  assert.equal(leerBorrador(futuro, PLANTILLA, AHORA), null)
  assert.equal(leerBorrador('{no json', PLANTILLA, AHORA), null)
  assert.equal(leerBorrador(null, PLANTILLA, AHORA), null)
})

test('claves extrañas o de otro tipo no se cuelan: se queda la plantilla', () => {
  const bruto = JSON.stringify({
    guardadoEn: AHORA,
    form: { descripcion: 42, intruso: 'x', vehiculo: { zonasDano: [1, 2] } },
  })
  const b = leerBorrador(bruto, PLANTILLA, AHORA)
  assert.equal(b?.form.descripcion, '')
  assert.equal((b?.form as Record<string, unknown>).intruso, undefined)
  assert.deepEqual(b?.form.vehiculo.zonasDano, [])
})

test('un formulario sin tocar no merece borrador', () => {
  assert.equal(merecePena({ descripcion: ' ', lugar: '', fechaHecho: '' }), false)
  assert.equal(merecePena({ descripcion: 'x', lugar: '', fechaHecho: '' }), true)
})
