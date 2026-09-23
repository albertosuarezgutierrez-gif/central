import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paramsDnploc, elegirViaConTipo, elegirVia, parsearCatastro, caracterizarVivienda } from './parser.ts'

// La dirección tal y como la dice un cliente de hogar (caso real, 02/09/2026).
test('«Calle San Vicente 40, 2º 14» → planta 2 y puerta 14', () => {
  const p = paramsDnploc('Calle San Vicente 40, 2º 14')
  assert.equal(p?.sigla, 'CL')
  assert.equal(p?.calle, 'SAN VICENTE')
  assert.equal(p?.numero, '40')
  assert.equal(p?.planta, '2')
  assert.equal(p?.puerta, '14')
})

test('«3º B» y «1º izquierda» siguen funcionando', () => {
  assert.equal(paramsDnploc('Avenida de Madrid 78, 3º B')?.puerta, 'B')
  assert.equal(paramsDnploc('C/ Sierpes 12, 1º izquierda')?.puerta, 'IZ')
})

test('sin ordinal no se confunde el portal con la puerta', () => {
  const p = paramsDnploc('Calle San Vicente 40')
  assert.equal(p?.puerta, null)
  assert.equal(p?.planta, null)
})

// ─── elegirViaConTipo() / elegirVia() ────────────────────────────────────────
// El callejero busca por SUBCADENA: «GANDIA» puede devolver varias calles.
// `elegirViaConTipo` desempata por tokens y, a diferencia de `elegirVia`,
// conserva el `tipo` (tv) de la ganadora — es lo que usa
// `resolverTipoViaPorNombre()` para averiguar el tipo de vía cuando la ficha
// no trae uno reconocible.

test('elegirViaConTipo: una única candidata gana y conserva su tipo', () => {
  const vias = [{ tipo: 'CL', nombre: 'PACO GANDIA' }]
  assert.deepEqual(elegirViaConTipo(vias, 'Paco Gandía'), { tipo: 'CL', nombre: 'PACO GANDIA' })
  assert.equal(elegirVia(vias, 'Paco Gandía'), 'PACO GANDIA')
})

test('elegirViaConTipo: entre varias, gana la que menos palabras sobrantes tiene', () => {
  const vias = [
    { tipo: 'AV', nombre: 'PACO GANDIA MOLINA' },
    { tipo: 'CL', nombre: 'PACO GANDIA' },
  ]
  // Las dos contienen los dos tokens buscados, pero la segunda no trae ninguno
  // de sobra: gana ella, no la más larga.
  assert.deepEqual(elegirViaConTipo(vias, 'Paco Gandia'), { tipo: 'CL', nombre: 'PACO GANDIA' })
})

test('elegirViaConTipo: mismo número de tokens sobrantes en candidatas distintas es ambigüedad', () => {
  // Ejemplo real del callejero: «GANDIA» encuentra «CIUDAD DE GANDIA» (2 tokens
  // tras quitar el artículo) y «PACO GANDIA» (2 tokens) — empatan, y `elegirVia`
  // no decide a dedo entre dos calles de la misma longitud.
  const vias = [
    { tipo: 'AV', nombre: 'CIUDAD DE GANDIA' },
    { tipo: 'CL', nombre: 'PACO GANDIA' },
  ]
  assert.equal(elegirViaConTipo(vias, 'Gandia'), null)
})

test('elegirViaConTipo: dos candidatas igual de ajustadas son ambigüedad real, no se elige a dedo', () => {
  const vias = [
    { tipo: 'CL', nombre: 'SAN VICENTE' },
    { tipo: 'AV', nombre: 'SAN VICENTE' },
  ]
  assert.equal(elegirViaConTipo(vias, 'San Vicente'), null)
  assert.equal(elegirVia(vias, 'San Vicente'), null)
})

test('elegirViaConTipo: sin candidatas, null', () => {
  assert.equal(elegirViaConTipo([], 'Severo Ochoa'), null)
  assert.equal(elegirViaConTipo([{ tipo: 'CL', nombre: 'SIERPES' }], 'Severo Ochoa'), null)
})

// ─── caracterizarVivienda() ──────────────────────────────────────────────────
// Fixtures recortados de respuestas REALES de Consulta_DNPRC/DNPLOC (23/09/2026).

const PISO_SAN_VICENTE_40 = `<consulta_dnp><bico><bi><ldt>CL SAN VICENTE 40 Es:1 Pl:02 Pt:11 41002 SEVILLA (SEVILLA)</ldt>
<debi><luso>Residencial</luso><sfc>112</sfc><ant>1994</ant></debi></bi>
<lcons><cons><lcd>VIVIENDA</lcd><dt><lourb><loint><es>1</es><pt>02</pt><pu>11</pu></loint></lourb></dt><dfcons><stl>87</stl></dfcons></cons>
<cons><lcd>ELEMENTOS COMUNES</lcd><dfcons><stl>25</stl></dfcons></cons></lcons></bico></consulta_dnp>`

const CASA_SOCORRO_24 = `<consulta_dnp><bico><bi><ldt>CL SOCORRO 24 41003 SEVILLA (SEVILLA)</ldt>
<debi><luso>Residencial</luso><sfc>275</sfc><cpt>100,000000</cpt><ant>2000</ant></debi></bi>
<lcons><cons><lcd>VIVIENDA</lcd><dt><lourb><loint><es>1</es><pt>00</pt><pu>01</pu></loint></lourb></dt><dfcons><stl>113</stl></dfcons></cons>
<cons><lcd>VIVIENDA</lcd><dt><lourb><loint><es>1</es><pt>01</pt><pu>01</pu></loint></lourb></dt><dfcons><stl>113</stl></dfcons></cons>
<cons><lcd>VIVIENDA</lcd><dt><lourb><loint><es>1</es><pt>02</pt><pu>01</pu></loint></lourb></dt><dfcons><stl>49</stl></dfcons></cons></lcons></bico></consulta_dnp>`

test('piso real: elementos comunes → piso, planta 2, 87 m² de vivienda (112 con comunes)', () => {
  const d = parsearCatastro(PISO_SAN_VICENTE_40)
  assert.equal(d.superficie, 112)
  assert.equal(d.anioConstruccion, 1994)
  assert.equal(d.construcciones.length, 2)
  assert.deepEqual(caracterizarVivienda(d), { tipo: 'piso', planta: 2, superficieVivienda: 87, anexos: [] })
})

test('casa real: la finca entera, tres plantas de vivienda → unifamiliar', () => {
  const v = caracterizarVivienda(parsearCatastro(CASA_SOCORRO_24))
  assert.equal(v?.tipo, 'unifamiliar')
  assert.equal(v?.planta, null)
  assert.equal(v?.superficieVivienda, 275)
})

test('sin unidades constructivas no se caracteriza, y una sola planta baja sin comunes NO se adivina', () => {
  assert.equal(caracterizarVivienda(parsearCatastro('<bico><debi><sfc>90</sfc></debi></bico>')), null)
  const baja = `<bico><lcons><cons><lcd>VIVIENDA</lcd><dt><lourb><loint><pt>00</pt></loint></lourb></dt><dfcons><stl>90</stl></dfcons></cons>
<cons><lcd>APARCAMIENTO</lcd><dfcons><stl>15</stl></dfcons></cons></lcons></bico>`
  const v = caracterizarVivienda(parsearCatastro(baja))
  assert.equal(v?.tipo, null)
  assert.deepEqual(v?.anexos, ['APARCAMIENTO'])
})

test('un BAJO con elementos comunes es un piso: lo decide el elemento común, no la planta', () => {
  const bajo = `<bico><lcons><cons><lcd>VIVIENDA</lcd><dt><lourb><loint><pt>00</pt><pu>A</pu></loint></lourb></dt><dfcons><stl>70</stl></dfcons></cons>
<cons><lcd>ELEMENTOS COMUNES</lcd><dfcons><stl>12</stl></dfcons></cons></lcons></bico>`
  assert.deepEqual(caracterizarVivienda(parsearCatastro(bajo)), { tipo: 'piso', planta: 0, superficieVivienda: 70, anexos: [] })
})
