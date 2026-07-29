// Extracción de datos desde las descripciones registrales REALES del BOE.
// Es lo que permite luego filtrar de verdad («viviendas >100 m² en Sevilla»)
// en vez de buscar texto a ciegas. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extraerDatos } from '../src/extraccion.ts'
import { palabrasANumero, superficieM2 } from '../src/numeros-es.ts'
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
