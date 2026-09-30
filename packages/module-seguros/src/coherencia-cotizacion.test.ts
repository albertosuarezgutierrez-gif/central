import { test } from 'node:test'
import assert from 'node:assert/strict'
import { franquiciaDelTexto, reparosPorFila, revisarCoherenciaCotizacion } from './coherencia-cotizacion.ts'

test('franquiciaDelTexto: lee los nombres REALES de las compañías', () => {
  assert.equal(franquiciaDelTexto('TERCEROS AMPLIADO - Franquicia 450€'), 450)
  assert.equal(franquiciaDelTexto('Terceros ampliado con franquicia de 1200'), 1200)
  assert.equal(franquiciaDelTexto('Reale Todo Riesgo Franquicia 1200 Euros'), 1200)
  assert.equal(franquiciaDelTexto('Todo Riesgo con franquicia de 1.500 €'), 1500)
  assert.equal(franquiciaDelTexto('Todo Riesgo con Franquicia Alta'), null)
  assert.equal(franquiciaDelTexto('ALLIANZ MOTO FRANQUICIA'), null)
  assert.equal(franquiciaDelTexto(null), null)
})

test('una cotización coherente no tiene reparos', () => {
  const precios = [
    { id: 'Q1', compania: 'Mapfre', categoria: 'Terceros ampliado', modalidad: 'TERCEROS AMPLIADO - Franquicia 450€', primaEur: 449.26, franquiciaEur: 450 },
    { id: 'Q2', compania: 'Mapfre', categoria: 'Terceros ampliado', modalidad: 'TERCEROS AMPLIADO - Franquicia 600€', primaEur: 446.77, franquiciaEur: 600 },
    { id: 'Q3', compania: 'Allianz', categoria: 'Todo Riesgo con Franquicia', modalidad: 'ALLIANZ MOTO FRANQUICIA', primaEur: 312.91, franquiciaEur: 194 },
  ]
  assert.deepEqual(revisarCoherenciaCotizacion(precios), [])
  assert.deepEqual(reparosPorFila(precios), [[], [], []])
})

test('prima no válida y franquicia que contradice el nombre', () => {
  const r = reparosPorFila([
    { id: 'Q1', compania: 'Reale', categoria: 'Terceros', modalidad: 'Terceros', primaEur: 0, franquiciaEur: null },
    { id: 'Q2', compania: 'Mapfre', categoria: 'Terceros ampliado', modalidad: 'TERCEROS AMPLIADO - Franquicia 450€', primaEur: 449, franquiciaEur: 600 },
  ])
  assert.match(r[0][0], /no da una prima válida/)
  assert.match(r[1][0], /franquicia de 450€ y la compañía declara 600€/)
})

test('«con franquicia» sin importe en ningún sitio → no consta, pregúntalo', () => {
  const r = reparosPorFila([{ id: 'Q1', compania: 'Occident', categoria: 'Todo Riesgo Con Franquicia Alta', modalidad: 'Todo Riesgo', primaEur: 400, franquiciaEur: null }])
  assert.match(r[0][0], /no dice de cuánto/)
  // Si el nombre sí dice el importe, no se inventa un reparo aunque el vendor no lo declare.
  assert.deepEqual(reparosPorFila([{ id: 'Q1', compania: 'Occident', categoria: 'Todo Riesgo Con Franquicia Alta', modalidad: 'Todo Riesgo con franquicia 1000', primaEur: 400, franquiciaEur: null }]), [[]])
})

test('identidad: id repetido, llave repetida SIN id, y sin id cuando las demás sí lo traen', () => {
  const tipos = (ps: Parameters<typeof revisarCoherenciaCotizacion>[0]) => revisarCoherenciaCotizacion(ps).map((x) => x.tipo).sort()
  const f = { compania: 'Reale', categoria: 'Terceros', modalidad: 'Terceros Básico', franquiciaEur: null }
  assert.deepEqual(tipos([{ ...f, id: 'Q1', primaEur: 300 }, { ...f, id: 'Q1', primaEur: 320 }]), ['id_repetido'])
  // Misma descripción pero con id distinto: al emitir se distinguen por el id → sin reparo.
  assert.deepEqual(tipos([{ ...f, id: 'Q1', primaEur: 300 }, { ...f, id: 'Q2', primaEur: 320 }]), [])
  // Misma descripción y una sin id: no hay forma de saber cuál es al emitir.
  assert.deepEqual(tipos([{ ...f, id: 'Q1', primaEur: 300 }, { ...f, id: null, primaEur: 320 }]), ['llave_repetida', 'sin_id'])
  // Cotización vieja (ninguna trae id): la llave repetida sí se avisa; el «sin id» no, sería ruido.
  assert.deepEqual(tipos([{ ...f, primaEur: 300 }, { ...f, primaEur: 320 }]), ['llave_repetida'])
  // Los precios que dejó un ReRate (con caducidad) no cuentan para la llave.
  assert.deepEqual(tipos([{ ...f, primaEur: 300 }, { ...f, primaEur: 320, expiraEn: '2026-10-30' }]), [])
})

test('franquicia con céntimos y «días» no dan reparos falsos', () => {
  assert.equal(franquiciaDelTexto('Franquicia 450,90€'), 450.9)
  assert.equal(franquiciaDelTexto('franquicia de 90 días'), null)
  assert.deepEqual(reparosPorFila([{ id: 'Q1', compania: 'X', categoria: 'TR', modalidad: 'Franquicia 450,90€', primaEur: 300, franquiciaEur: 450.9 }]), [[]])
})
