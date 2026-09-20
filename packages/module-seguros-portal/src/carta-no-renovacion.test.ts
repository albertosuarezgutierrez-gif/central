import test from 'node:test'
import assert from 'node:assert/strict'

import { HUECOS_CARTA, componerCartaNoRenovacion, estadoPlazoCarta, fechaEnLetra } from './carta-no-renovacion.ts'

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

test('en plazo: hoy es anterior a la fecha accionable (vencimiento − 30 días)', () => {
  const r = estadoPlazoCarta({ fechaVencimiento: utc(2026, 3, 15), hoy: utc(2026, 2, 1) })
  assert.equal(r.estado, 'en_plazo')
  assert.equal(r.fechaLimite?.toISOString().slice(0, 10), '2026-02-13')
  assert.equal(r.diasRestantes, 12)
})

test('el último día accionable todavía es en plazo (≥ 0), el siguiente ya no', () => {
  assert.equal(estadoPlazoCarta({ fechaVencimiento: utc(2026, 3, 15), hoy: utc(2026, 2, 13) }).estado, 'en_plazo')
  const fuera = estadoPlazoCarta({ fechaVencimiento: utc(2026, 3, 15), hoy: utc(2026, 2, 14) })
  assert.equal(fuera.estado, 'fuera_de_plazo')
  assert.equal(fuera.diasRestantes, -1)
})

test('vencida: la fecha guardada ya es pasada, y NO se confunde con fuera de plazo', () => {
  const r = estadoPlazoCarta({ fechaVencimiento: utc(2026, 3, 15), hoy: utc(2026, 3, 16) })
  assert.equal(r.estado, 'vencida')
})

test('sin fecha no se afirma nada del plazo', () => {
  assert.deepEqual(estadoPlazoCarta({ fechaVencimiento: null, hoy: utc(2026, 1, 1) }), {
    estado: 'sin_fecha',
    fechaLimite: null,
    diasRestantes: null,
  })
})

test('la carta lleva los datos que tenemos y HUECOS visibles para los que no', () => {
  const carta = componerCartaNoRenovacion({
    poliza: { compania: 'Mapfre', numeroPoliza: '123-ABC', ramo: 'auto', fechaVencimiento: utc(2026, 3, 15) },
    tomador: 'Juana Pérez López',
    hoy: utc(2026, 2, 1),
  })
  assert.equal(carta.asunto, 'Comunicación de no renovación de la póliza n.º 123-ABC')
  assert.match(carta.cuerpo, /Yo, Juana Pérez López, con NIF \[TU NIF\]/)
  assert.match(carta.cuerpo, /póliza n\.º 123-ABC del ramo de auto/)
  assert.match(carta.cuerpo, /vencimiento el 15 de marzo de 2026/)
  assert.match(carta.cuerpo, /artículo 22 de la Ley 50\/1980/)
  assert.match(carta.cuerpo, /1 de febrero de 2026/)
  // El NIF y la localidad NUNCA los sabe el portal: siempre son hueco.
  assert.deepEqual(carta.huecos, ['nif', 'lugar'])
})

test('sin nombre, sin compañía, sin número y sin fecha: todo hueco, nada inventado', () => {
  const carta = componerCartaNoRenovacion({
    poliza: { compania: null, numeroPoliza: '  ', ramo: null, fechaVencimiento: null },
    tomador: null,
    hoy: utc(2026, 2, 1),
  })
  assert.deepEqual(carta.huecos, ['tomador', 'nif', 'compania', 'numeroPoliza', 'fechaVencimiento', 'lugar'])
  for (const hueco of Object.values(HUECOS_CARTA)) {
    assert.ok(carta.cuerpo.includes(hueco), `falta el hueco ${hueco}`)
  }
  // Un ramo desconocido no se pinta como «del ramo de null».
  assert.ok(!carta.cuerpo.includes('ramo de'))
})

test('un valor de cajón («desconocido» ya anulado aguas arriba) cuenta como hueco si llega vacío', () => {
  const carta = componerCartaNoRenovacion({
    poliza: { compania: '', numeroPoliza: null, ramo: 'hogar', fechaVencimiento: utc(2027, 1, 10) },
    tomador: '',
    hoy: utc(2026, 2, 1),
  })
  assert.ok(carta.huecos.includes('tomador'))
  assert.ok(carta.huecos.includes('compania'))
})

test('la fecha en letra va en UTC: una medianoche UTC no retrocede un día', () => {
  assert.equal(fechaEnLetra(utc(2026, 3, 1)), '1 de marzo de 2026')
})
