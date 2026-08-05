// Extracción de datos desde las descripciones registrales REALES del BOE.
// Es lo que permite luego filtrar de verdad («viviendas >100 m² en Sevilla»)
// en vez de buscar texto a ciegas. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerDatos } from '../src/extraccion.ts'
import { palabrasANumero, superficieM2, superficiesM2 } from '../src/numeros-es.ts'
import { parsearAlertaBoe } from '../src/email-boe.ts'
import { CORREOS_REALES } from './fixtures-reales.ts'

const porId = new Map(
  CORREOS_REALES.flatMap((c) => parsearAlertaBoe(c.html, c.asunto))
    .map((r) => [r.subasta.identificador!, r.subasta.descripcion ?? '']),
)

test('números en letra', () => {
  assert.equal(palabrasANumero('ciento quince'), 115)
  assert.equal(palabrasANumero('sesenta y seis'), 66)
  assert.equal(palabrasANumero('tres'), 3)
  assert.equal(palabrasANumero('mil doscientos treinta y cuatro'), 1234)
  assert.equal(palabrasANumero('dos millones'), 2000000)
  assert.equal(palabrasANumero('ninguna palabra'), null)
})

test('superficie en cifra y en letra', () => {
  assert.equal(superficieM2('Superficie total construida 605 m2'), 605)
  assert.equal(superficieM2('superficie de 115,66 metros cuadrados'), 115.66)
  assert.equal(superficieM2('superficie de 1.250 metros cuadrados'), 1250)
  // La forma registral escrita, que es la que más aparece.
  assert.equal(
    superficieM2('con superficie de ciento quince metros con sesenta y seis decimetros cuadrados'),
    115.66,
  )
  assert.equal(superficieM2('sin datos de superficie'), null)
})

test('REAL Sevilla: vivienda en Dos Hermanas de 605 m²', () => {
  const d = extraerDatos(porId.get('SUB-JA-2026-264062'))
  assert.equal(d.tipoBien, 'vivienda')
  assert.equal(d.superficie, 605)
  assert.equal(d.fincaRegistral, '9670')
  assert.match(d.registroPropiedad ?? '', /Dos Hermanas/)
  assert.match(d.direccion ?? '', /Serrezuela/)
})

test('REAL Puerto de Santa María: piso con superficie escrita en letra', () => {
  const d = extraerDatos(porId.get('SUB-JA-2026-264154'))
  assert.equal(d.tipoBien, 'vivienda')
  assert.equal(d.superficie, 115.66)   // «ciento quince metros con sesenta y seis decimetros»
  assert.equal(d.dormitorios, 3)       // «tres dormitorios»
  assert.equal(d.banos, 2)             // «dos cuartos de baño»
  assert.equal(d.planta, 'segunda')
  assert.equal(d.fincaRegistral, '25.143')
  assert.equal(d.cuotaParticipacion, 3.08) // «tres enteros, ocho centésimas por ciento»
  assert.match(d.direccion ?? '', /Virgen de los Milagros/)
})

test('REAL Asturias: parcela con edificación', () => {
  const d = extraerDatos(porId.get('SUB-JA-2026-264269'))
  assert.equal(d.tipoBien, 'parcela')
  assert.equal(d.fincaRegistral, '24.482')
  assert.match(d.registroPropiedad ?? '', /PRAVIA/i)
  assert.match(d.direccion ?? '', /Pumarada/)
})

test('REAL Punta Umbría: descripción plantilla → todo null, nada inventado', () => {
  const d = extraerDatos(porId.get('SUB-JA-2026-264600'))
  assert.equal(d.superficie, null)
  assert.equal(d.fincaRegistral, null)
  assert.equal(d.direccion, null)
  assert.equal(d.dormitorios, null)
  assert.equal(d.tipoBien, 'otro')
})

test('el tipo de bien prioriza lo específico sobre lo genérico', () => {
  assert.equal(extraerDatos('Plaza de garaje en edificio de viviendas').tipoBien, 'garaje')
  assert.equal(extraerDatos('Finca rústica de olivar en secano').tipoBien, 'finca_rustica')
  assert.equal(extraerDatos('Local comercial en planta baja').tipoBien, 'local')
  assert.equal(extraerDatos('Nave industrial').tipoBien, 'nave')
})

// ── Superficie: las formas que el BOE escribe de verdad (auditado 05/08/2026) ─
// De 17 subastas vivas solo 5 tenían superficie. Dos de las que faltaban SÍ la
// publicaban en el texto y no se extraía, porque la fórmula registral separa
// metros y decímetros con una COMA y solo se aceptaba «con».

test('la fórmula registral con COMA en vez de «con»', () => {
  // SUB-JA-2026-264811, Sevilla. Antes devolvía null y la subasta se quedaba
  // sin margen de flip por «falta de datos» teniéndolos delante.
  assert.equal(
    superficieM2('Tiene una superficie construida de setenta y siete metros, diecinueve decímetros cuadrados. Linda por la derecha con el piso letra C.'),
    77.19,
  )
})

test('cifras y letra mezcladas en la misma medida', () => {
  // SUB-JA-2026-264398, Alcalá del Río: «105 metros, 5 decimetros cuadrados».
  assert.equal(superficieM2('La superficie de la parcela es aproximadamente de 105 metros, 5 decimetros cuadrados.'), 105.05)
  assert.equal(superficieM2('catorce metros y cuarenta y siete decímetros cuadrados'), 14.47)
})

test('con varias superficies manda la CONSTRUIDA, no la primera que aparece', () => {
  // El caso caro: en una unifamiliar la parcela se cita ANTES que lo construido.
  // Quedarse con la primera valora el inmueble por el solar.
  const texto = 'VIVIENDA UNIFAMILIAR. La superficie de la parcela es aproximandamente de 105 metros, 5 decimetros cuadrados. ' +
    'Lavivienda tiene una superficio construida aproximada de 140 metros, 6 decimetros cuadrados. ' +
    'Dispone de un solarum de catorce metros y cuarenta y siete decímetros cuadrados.'
  assert.equal(superficieM2(texto), 140.06)
  const medidas = superficiesM2(texto)
  assert.deepEqual(
    medidas.map((m) => [m.m2, m.clase]),
    [[105.05, 'parcela'], [140.06, 'construida'], [14.47, 'sin_etiqueta']],
  )
})

test('la errata «superficio construida» del BOE sigue contando como construida', () => {
  assert.equal(superficiesM2('superficio construida aproximada de 140 metros, 6 decimetros cuadrados')[0].clase, 'construida')
})

test('entre medidas de la misma clase se queda con la mayor (el total, no una estancia)', () => {
  assert.equal(
    superficieM2('Superficie construida de 90 metros cuadrados. La cocina tiene una superficie construida de 8 metros cuadrados.'),
    90,
  )
})

test('sin superficie en el texto sigue devolviendo null, no un cero', () => {
  assert.equal(superficieM2('Vivienda en Sevilla, sita en C/ PACO GANDIA 26'), null)
  assert.deepEqual(superficiesM2('Vivienda en Sevilla'), [])
})
