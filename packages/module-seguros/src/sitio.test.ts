import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leerSitio, textoReparoSitio } from './sitio.ts'

test('lo que concuerda se afirma tal cual', () => {
  const r = leerSitio({ codigoPostal: '41003', ciudad: 'Sevilla', provincia: 'Sevilla' })
  assert.equal(r.texto, '41003 Sevilla, Sevilla')
  assert.deepEqual(r.reparos, [])
})

test('el caso de Manuel Piña Franco: CP de Sevilla, un número en la ciudad y otra provincia', () => {
  const r = leerSitio({ codigoPostal: '41807', ciudad: '34304', provincia: 'Tarragona' })
  // Ni «34304» como ciudad ni «Tarragona» como provincia: lo único que se
  // sostiene es el CP.
  assert.equal(r.texto, '41807')
  assert.deepEqual(
    r.reparos.map((x) => x.tipo).sort(),
    ['ciudad_sin_letras', 'provincia_no_cuadra'],
  )
})

test('la provincia que contradice al CP no se sustituye por la del CP: se calla y se explica', () => {
  const r = leerSitio({ codigoPostal: '41807', ciudad: 'Espartinas', provincia: 'Tarragona' })
  assert.equal(r.texto, '41807 Espartinas')
  assert.equal(r.reparos.length, 1)
  const [reparo] = r.reparos
  assert.equal(reparo.tipo, 'provincia_no_cuadra')
  if (reparo.tipo === 'provincia_no_cuadra') assert.equal(reparo.segunCp, 'Sevilla')
  assert.match(textoReparoSitio(reparo), /Tarragona/)
  assert.match(textoReparoSitio(reparo), /Sevilla/)
})

test('los dos nombres de una misma provincia NO son una contradicción', () => {
  for (const [cp, provincia] of [
    ['48001', 'Vizcaya'],
    ['48001', 'Bizkaia'],
    ['15001', 'La Coruña'],
    ['17001', 'Gerona'],
    ['25001', 'Lérida'],
    ['32001', 'Orense'],
    ['07001', 'Baleares'],
    ['38001', 'Tenerife'],
    ['01001', 'Álava'],
    ['20001', 'Guipúzcoa'],
  ] as const) {
    assert.deepEqual(leerSitio({ codigoPostal: cp, provincia }).reparos, [], `${cp} ${provincia}`)
  }
})

test('sin CP, la provincia guardada es lo único que hay y se dice', () => {
  const r = leerSitio({ ciudad: 'Reus', provincia: 'Tarragona' })
  assert.equal(r.texto, 'Reus, Tarragona')
  assert.deepEqual(r.reparos, [])
})

test('el CP de 4 dígitos del volcado recupera su cero y NO es un reparo', () => {
  // 602 fichas están así (medido 05/09/2026): un CP español de 4 dígitos solo
  // puede ser 0XXXX.
  const r = leerSitio({ codigoPostal: '8830', ciudad: 'Sant Boi', provincia: 'Barcelona' })
  assert.equal(r.texto, '08830 Sant Boi, Barcelona')
  assert.deepEqual(r.reparos, [])
})

test('un CP que no es un CP español no se pinta como CP', () => {
  const r = leerSitio({ codigoPostal: '99999', ciudad: 'Sevilla', provincia: 'Sevilla' })
  assert.equal(r.texto, 'Sevilla, Sevilla')
  assert.deepEqual(r.reparos.map((x) => x.tipo), ['cp_invalido'])
})

test('ficha sin nada: texto null y ningún reparo (no hay ≠ está mal)', () => {
  assert.deepEqual(leerSitio({}), { texto: null, reparos: [] })
  assert.deepEqual(leerSitio({ codigoPostal: '  ', ciudad: null, provincia: undefined }), { texto: null, reparos: [] })
})
