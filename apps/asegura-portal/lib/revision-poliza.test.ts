import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decidirRevision,
  entradaDesdeFila,
  hayClaveIA,
  huellaRevision,
  MAX_PUNTOS,
  MAX_REVISIONES_DIA,
  normalizarPuntos,
  promptRevision,
  puntosGuardados,
  tieneMaterial,
  type EntradaRevision,
} from './revision-poliza.ts'

const E: EntradaRevision = {
  ramo: 'hogar',
  compania: 'Mapfre',
  primaAnual: 310.5,
  periodicidadPago: 'anual',
  fechaVencimiento: '2027-03-01',
  coberturas: ['Incendio', 'Robo'],
  datosRamo: { metrosCuadrados: 80, anioConstruccion: 1990 },
}

test('la huella es estable y no depende del orden de coberturas ni de claves', () => {
  const b = { ...E, coberturas: ['Robo', 'Incendio'], datosRamo: { anioConstruccion: 1990, metrosCuadrados: 80 } }
  assert.equal(huellaRevision(E), huellaRevision(b))
  assert.match(huellaRevision(E), /^[0-9a-f]{64}$/)
})

test('la huella cambia si cambia el documento (coberturas, prima, vencimiento)', () => {
  const h = huellaRevision(E)
  assert.notEqual(h, huellaRevision({ ...E, coberturas: ['Incendio'] }))
  assert.notEqual(h, huellaRevision({ ...E, primaAnual: 400 }))
  assert.notEqual(h, huellaRevision({ ...E, fechaVencimiento: '2028-03-01' }))
})

test('coberturas null (no leídas) y [] (leídas, ninguna) NO son lo mismo', () => {
  assert.notEqual(huellaRevision({ ...E, coberturas: null }), huellaRevision({ ...E, coberturas: [] }))
  assert.match(promptRevision({ ...E, coberturas: null }), /NO LEÍDAS/)
  assert.match(promptRevision({ ...E, coberturas: [] }), /no aparece ninguna/)
})

test('sin coberturas ni datos del ramo no hay material', () => {
  assert.equal(tieneMaterial({ ...E, coberturas: null, datosRamo: null }), false)
  assert.equal(tieneMaterial({ ...E, coberturas: [], datosRamo: { a: '' } }), false)
  assert.equal(tieneMaterial(E), true)
})

test('el prompt no lleva identificadores personales', () => {
  const p = promptRevision({ ...E, datosRamo: { metrosCuadrados: 80 } })
  assert.doesNotMatch(p, /matr[ií]cula|direcci[oó]n|n[uú]mero de p[oó]liza/i)
})

test('normalizarPuntos: máximo 3, recorta y tolera texto alrededor del JSON', () => {
  const p = (n: number) => ({ titulo: `Punto ${n}`, detalle: `Conviene revisar el aspecto ${n}.` })
  const salida = 'Claro: ' + JSON.stringify({ puntos: [p(1), p(2), p(3), p(4)] }) + ' fin'
  const r = normalizarPuntos(salida)
  assert.equal(r?.length, MAX_PUNTOS)
  assert.equal(r?.[0].titulo, 'Punto 1')
})

test('normalizarPuntos: ilegible = null (error), vacío = [] (nada que destacar)', () => {
  assert.equal(normalizarPuntos('no sé'), null)
  assert.equal(normalizarPuntos('{"puntos": "x"}'), null)
  assert.deepEqual(normalizarPuntos('{"puntos":[]}'), [])
})

test('normalizarPuntos: descarta lo que juzga la póliza o recomienda compañía', () => {
  const malos = [
    'Tu seguro es malo para este riesgo',
    'Te recomendamos cambiar de compañía',
    'Contrata una póliza mejor',
    'Esta es la mejor compañía del mercado',
  ]
  for (const detalle of malos) {
    assert.deepEqual(normalizarPuntos(JSON.stringify({ puntos: [{ titulo: 'Franquicia', detalle }] })), [], detalle)
  }
  const ok = normalizarPuntos(JSON.stringify({ puntos: [{ titulo: 'Franquicia', detalle: 'Conviene revisar si la franquicia de 600 euros encaja contigo.' }] }))
  assert.equal(ok?.length, 1)
})

test('decidirRevision: lo cacheado gana a todo; luego clave, material, tope', () => {
  const base = { hayIa: true, tieneMaterial: true, hayCache: false, usadasHoy: 0 }
  assert.deepEqual(decidirRevision({ ...base, hayCache: true, hayIa: false, usadasHoy: 99 }), { accion: 'cacheada' })
  assert.deepEqual(decidirRevision({ ...base, hayIa: false }), { accion: 'sin_ia' })
  assert.deepEqual(decidirRevision({ ...base, tieneMaterial: false }), { accion: 'sin_datos' })
  assert.deepEqual(decidirRevision({ ...base, usadasHoy: MAX_REVISIONES_DIA }), { accion: 'tope' })
  assert.deepEqual(decidirRevision({ ...base, usadasHoy: MAX_REVISIONES_DIA - 1 }), { accion: 'generar' })
})

test('hayClaveIA: una vacía o en blanco no cuenta', () => {
  assert.equal(hayClaveIA({}), false)
  assert.equal(hayClaveIA({ OPENROUTER_API_KEY: '  ' }), false)
  assert.equal(hayClaveIA({ GROQ_API_KEY: 'gsk_x' }), true)
})

test('puntosGuardados: forma defensiva', () => {
  assert.equal(puntosGuardados(null), null)
  assert.deepEqual(puntosGuardados([{ titulo: 'a', detalle: 'b' }, { titulo: '', detalle: 'x' }, 3]), [{ titulo: 'a', detalle: 'b' }])
})

test('entradaDesdeFila: coberturas null sigue siendo null, [] sigue siendo [], Decimal a número', () => {
  const fila = { ramo: 'auto', compania: null, primaAnual: '450.20', periodicidadPago: null, fechaVencimiento: new Date('2027-01-05T00:00:00Z'), coberturas: null, datosRamo: [1] }
  const a = entradaDesdeFila(fila)
  assert.equal(a.coberturas, null)
  assert.equal(a.datosRamo, null)
  assert.equal(a.primaAnual, 450.2)
  assert.equal(a.fechaVencimiento, '2027-01-05')
  assert.deepEqual(entradaDesdeFila({ ...fila, coberturas: [] }).coberturas, [])
  assert.equal(entradaDesdeFila({ ...fila, primaAnual: null }).primaAnual, null)
})
