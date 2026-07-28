// Tests del parseo puro de anuncios de subasta. `node --test` (type-stripping).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cargasConocidasDe,
  clasificarTipo,
  ejecutadoDe,
  esInmueble,
  extraerIdBoe,
  extraerIdSubasta,
  extraerRefCatastral,
  parseFechaEs,
  parseImporteEs,
  porcentajeSubastadoDe,
  sinVisitaDe,
  situacionPosesoriaDe,
} from '../src/parsing.ts'

test('parseImporteEs entiende el formato español', () => {
  assert.equal(parseImporteEs('1.234.567,89 €'), 1234567.89)
  assert.equal(parseImporteEs('60.000'), 60000)
  assert.equal(parseImporteEs('2.000,12€'), 2000.12)
  assert.equal(parseImporteEs('1234,56'), 1234.56)
  assert.equal(parseImporteEs('850'), 850)
  // Espacio duro, habitual en los HTML del BOE.
  assert.equal(parseImporteEs('12.500,00 €'), 12500)
})

test('parseImporteEs no inventa cuando el dato no sirve', () => {
  assert.equal(parseImporteEs(null), null)
  assert.equal(parseImporteEs(''), null)
  assert.equal(parseImporteEs('sin especificar'), null)
  assert.equal(parseImporteEs('1,2,3'), null)
})

test('parseImporteEs distingue millar de decimal cuando solo hay puntos', () => {
  // Grupos de 3 tras el primer punto = separador de millares.
  assert.equal(parseImporteEs('1.234.567'), 1234567)
  // Grupo que no es de 3 = punto decimal (formato anglosajón colado).
  assert.equal(parseImporteEs('1234.56'), 1234.56)
})

test('parseFechaEs convierte fecha española a ISO y rechaza imposibles', () => {
  assert.equal(parseFechaEs('12/03/2026'), '2026-03-12T00:00:00.000Z')
  assert.equal(parseFechaEs('12-03-2026 18:30'), '2026-03-12T18:30:00.000Z')
  assert.equal(parseFechaEs('2026-03-12T18:30'), '2026-03-12T18:30:00.000Z')
  assert.equal(parseFechaEs('31/02/2026'), null)
  assert.equal(parseFechaEs('no consta'), null)
})

test('extrae identificadores oficiales', () => {
  assert.equal(extraerIdSubasta('Subasta SUB-JA-2026-123456 del juzgado'), 'SUB-JA-2026-123456')
  assert.equal(extraerIdSubasta('sub-ne-2026-9'), 'SUB-NE-2026-9')
  assert.equal(extraerIdSubasta('no hay id'), null)
  assert.equal(extraerIdBoe('anuncio BOE-B-2026-12345'), 'BOE-B-2026-12345')
})

test('la referencia catastral exige mezcla de letras y dígitos', () => {
  assert.equal(extraerRefCatastral('Ref. catastral 9872023VH5797S0001WX'), '9872023VH5797S0001WX')
  // 20 dígitos seguidos son un número de cuenta, no una referencia catastral.
  assert.equal(extraerRefCatastral('12345678901234567890'), null)
  assert.equal(extraerRefCatastral(null), null)
})

test('clasificarTipo prioriza el contenido sobre el prefijo del identificador', () => {
  assert.equal(clasificarTipo('Juzgado de Primera Instancia nº 3 de Sevilla'), 'judicial')
  assert.equal(clasificarTipo('Notaría de Don Fulano'), 'notarial')
  assert.equal(clasificarTipo('Agencia Estatal de Administración Tributaria'), 'agencia_tributaria')
  assert.equal(clasificarTipo('Tesorería General de la Seguridad Social de Sevilla'), 'seguridad_social')
  assert.equal(clasificarTipo('administración concursal de la mercantil'), 'concursal')
  assert.equal(clasificarTipo('Ayuntamiento de Dos Hermanas, enajenación de bienes patrimoniales'), 'administrativa')
  // Sin señal en el texto, el prefijo del id decide.
  assert.equal(clasificarTipo('texto neutro', 'SUB-JA-2026-1'), 'judicial')
  assert.equal(clasificarTipo('texto neutro'), 'otra')
})

test('esInmueble separa fincas de coches', () => {
  assert.equal(esInmueble('Vivienda unifamiliar en Camas'), true)
  assert.equal(esInmueble('Parcela rústica de 3 hectáreas'), true)
  assert.equal(esInmueble('Vehículo turismo marca Seat'), false)
  assert.equal(esInmueble('Maquinaria industrial y mobiliario'), false)
  assert.equal(esInmueble(''), false)
  // Un garaje que se subasta junto al coche sigue siendo inmueble.
  assert.equal(esInmueble('Plaza de garaje y vehículo turismo'), true)
})

test('situacionPosesoriaDe distingue callar de afirmar que está libre', () => {
  assert.equal(situacionPosesoriaDe('La finca se encuentra libre de ocupantes'), 'libre')
  assert.equal(situacionPosesoriaDe('Inmueble ocupado por terceros'), 'ocupada')
  assert.equal(situacionPosesoriaDe('Se desconoce la situación posesoria'), 'ocupada_desconocida')
  assert.equal(situacionPosesoriaDe('Descripción sin más detalles'), 'desconocida')
  assert.equal(situacionPosesoriaDe(''), 'desconocida')
})

test('ejecutadoDe detecta empresa (cambia el impuesto aplicable)', () => {
  assert.equal(ejecutadoDe('ejecución contra PROMOCIONES DEL SUR S.L.'), 'juridica')
  assert.equal(ejecutadoDe('contra Don Fulano de Tal'), 'fisica')
  assert.equal(ejecutadoDe('sin datos'), 'desconocido')
})

test('sinVisitaDe y porcentajeSubastadoDe', () => {
  assert.equal(sinVisitaDe('No se permite la visita al inmueble'), true)
  assert.equal(sinVisitaDe('Visitas concertadas con el juzgado'), false)
  assert.equal(porcentajeSubastadoDe('Se subasta el 50% del pleno dominio'), 50)
  assert.equal(porcentajeSubastadoDe('Se subasta una mitad indivisa pro indiviso'), 50)
  assert.equal(porcentajeSubastadoDe('Se subasta la finca completa'), null)
})

test('cargasConocidasDe marca como desconocidas las no publicadas', () => {
  assert.equal(cargasConocidasDe('Cargas: hipoteca a favor de Banco X por 30.000 €'), true)
  assert.equal(cargasConocidasDe('Se desconocen las cargas de la finca'), false)
  assert.equal(cargasConocidasDe('Sin información de cargas'), false)
  assert.equal(cargasConocidasDe(''), false)
})
