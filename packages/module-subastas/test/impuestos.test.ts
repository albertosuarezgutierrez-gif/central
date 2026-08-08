// ITP por comunidad autónoma + su efecto en el coste. `node --test`.
// El caso que motiva esto: una vivienda de Asturias costeada con el 7% andaluz.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itpGeneral } from '../src/impuestos.ts'
import { calcularCoste } from '../src/costes.ts'
import type { SubastaInmueble } from '../src/types.ts'

test('itpGeneral: provincias directas y con tilde/variantes', () => {
  assert.equal(itpGeneral('Asturias')!.tipo, 0.08)
  assert.equal(itpGeneral('Asturias')!.progresivo, true)
  assert.equal(itpGeneral('Madrid')!.tipo, 0.06)
  assert.equal(itpGeneral('Sevilla')!.ccaa, 'Andalucía')
  assert.equal(itpGeneral('Ávila')!.ccaa, 'Castilla y León')
  assert.equal(itpGeneral('A Coruña')!.ccaa, 'Galicia')
  assert.equal(itpGeneral('Alicante/Alacant')!.ccaa, 'C. Valenciana')
  assert.equal(itpGeneral('Bizkaia')!.ccaa, 'País Vasco')
})

test('itpGeneral: sin provincia o sin reconocer → null, nunca se adivina', () => {
  assert.equal(itpGeneral(null), null)
  assert.equal(itpGeneral(''), null)
  assert.equal(itpGeneral('Provenza'), null)
})

const base: SubastaInmueble = {
  dedupeKey: 'x', fuente: 'boe', tipo: 'judicial',
  valorSubasta: 100000, cargas: 0, cargasConocidas: true,
  situacionPosesoria: 'libre', ejecutado: 'fisica',
}

test('calcularCoste: Asturias tributa al 8% del primer tramo, con aviso', () => {
  const c = calcularCoste({ ...base, provincia: 'Asturias' })
  assert.equal(c.impuestoTransmision, 8000)
  assert.match(c.impuestoConcepto, /ITP 8%/)
  assert.ok(c.avisos.some((a) => a.includes('Asturias') && a.includes('escala')))
})

test('calcularCoste: Madrid al 6% con aviso del tipo aplicado', () => {
  const c = calcularCoste({ ...base, provincia: 'Madrid' })
  assert.equal(c.impuestoTransmision, 6000)
  assert.ok(c.avisos.some((a) => a.includes('Madrid')))
})

test('calcularCoste: Andalucía sigue al 7% y SIN aviso nuevo (es el default sano)', () => {
  const c = calcularCoste({ ...base, provincia: 'Sevilla' })
  assert.equal(c.impuestoTransmision, 7000)
  assert.ok(!c.avisos.some((a) => a.includes('CCAA') || a.includes('tipo general de')))
})

test('calcularCoste: sin provincia → default 7% sin aviso; provincia rara → aviso', () => {
  assert.equal(calcularCoste(base).impuestoTransmision, 7000)
  const c = calcularCoste({ ...base, provincia: 'Provenza' })
  assert.equal(c.impuestoTransmision, 7000)
  assert.ok(c.avisos.some((a) => a.includes('sin CCAA reconocida')))
})

test('calcularCoste: un tipoItp explícito del caller MANDA sobre la CCAA', () => {
  const c = calcularCoste({ ...base, provincia: 'Asturias' }, null, { tipoItp: 0.06 })
  assert.equal(c.impuestoTransmision, 6000)
})

test('el ejecutado empresa (IVA+AJD) no pasa por la tabla de ITP', () => {
  const c = calcularCoste({ ...base, provincia: 'Asturias', ejecutado: 'juridica' })
  assert.match(c.impuestoConcepto, /IVA/)
  assert.equal(c.impuestoTransmision, 22200)
})
