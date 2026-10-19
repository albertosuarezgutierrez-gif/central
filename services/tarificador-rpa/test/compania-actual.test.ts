// Casado puro de la «Compañía actual del vehículo» de Allianz Turismos (v0.6.15). Nombres de aseguradoras del catálogo del portal
// (trabajo real 02fd821b, 96 opciones); ningún dato personal.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aliasDeOpcion, casarCompaniaActual, mensajeCompaniaAmbigua, normalizarCompania } from '../src/compania-actual.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { MENSAJE_FALTA_COMPANIA_ACTUAL, mensajeCompaniaNoCasa, exigirCompaniaActualTurismos } from '../src/adapters/allianz/auto.ts'
import type { FormularioAuto } from '@central/module-tarificacion'

const LISTA = [
  'AXA, SEGUROS GENERALES S.A.',
  'CATALANA OCCIDENTE, S.A. DE SEGUROS Y REASEGUROS',
  'GENERALI-LA ESTRELLA',
  'LÍNEA DIRECTA/SEGUROS NUEZ',
  'MAPFRE ESPAÑA COMPAÑÍA DE SEGUROS',
  'MUTUA MADRILEÑA AUTOMOVILISTA',
  'PELAYO/PELAYONEX',
  'REALE AUTOS',
  'ZURICH INSURANCE PLC SUC. ESPAÑA',
  'ALLIANZ DIRECT VERSICHERUNGS-AG, SUCURSAL EN ESPAÑA',
  'BBVA ALLIANZ SEGUROS Y REASEGUROS',
]
const idx = (buscada: string) => casarCompaniaActual(LISTA, buscada)

test('normalizar: sin tildes, puntuación, formas societarias ni relleno', () => {
  assert.equal(normalizarCompania('CATALANA OCCIDENTE, S.A. DE SEGUROS Y REASEGUROS'), 'catalana occidente')
  assert.equal(normalizarCompania('ZURICH INSURANCE PLC SUC. ESPAÑA'), 'zurich insurance')
  assert.equal(normalizarCompania('LÍNEA  Directa'), 'linea directa')
  assert.equal(normalizarCompania('Seguros S.A.'), '')
  assert.equal(normalizarCompania(null), '')
})

test('alias: se trocea por «/» y «-»', () => {
  assert.deepEqual(aliasDeOpcion('LÍNEA DIRECTA/SEGUROS NUEZ'), ['linea directa nuez', 'linea directa', 'nuez'])
  assert.ok(aliasDeOpcion('GENERALI-LA ESTRELLA').includes('generali'))
  assert.ok(aliasDeOpcion('PELAYO/PELAYONEX').includes('pelayonex'))
})

test('casa por palabra clave distintiva: una sola candidata', () => {
  for (const [buscada, i] of [['Línea Directa', 3], ['LINEA DIRECTA SEGUROS', 3], ['Nuez', 3], ['Mapfre', 4], ['MAPFRE ESPAÑA, S.A.', 4], ['Mutua', 5], ['Mutua Madrileña', 5], ['Generali', 2], ['Generali Seguros', 2], ['La Estrella', 2], ['Pelayo', 6], ['Pelayonex', 6], ['Reale', 7], ['AXA', 0], ['Zurich', 8], ['Catalana Occidente', 1]] as const) {
    const r = idx(buscada)
    assert.equal(r.estado, 'unica', buscada)
    assert.deepEqual(r.indices, [i], buscada)
  }
})

test('ambigua: «Allianz» casa con ALLIANZ DIRECT y BBVA ALLIANZ → no se elige; «Allianz Direct» sí es una', () => {
  const r = idx('Allianz')
  assert.equal(r.estado, 'ambigua')
  assert.deepEqual(r.indices, [9, 10])
  assert.equal(idx('Allianz Direct').estado, 'unica')
  assert.deepEqual(idx('Allianz Direct').indices, [9])
  assert.deepEqual(idx('BBVA Allianz').indices, [10])
})

test('la igualdad exacta gana a la contención (no se funde con hermanas)', () => {
  const l = ['MAPFRE ESPAÑA COMPAÑÍA DE SEGUROS', 'MAPFRE VIDA']
  assert.deepEqual(casarCompaniaActual(l, 'Mapfre Vida').indices, [1])
  assert.deepEqual(casarCompaniaActual(l, 'Mapfre').indices, [0], 'igual exacta (sin España/Compañía/Seguros) gana a «MAPFRE VIDA» por contención')
  assert.equal(casarCompaniaActual(['MAPFRE VIDA', 'MAPFRE EMPRESAS'], 'Mapfre').estado, 'ambigua', 'dos por contención: no se elige')
})

test('nunca se inventa: sin parecido, trozos de palabra o vacío → ninguna', () => {
  for (const b of ['Compañía Inexistente', 'Past', 'Gener', 'Seguros S.A.', '   ', 'S.A.']) assert.equal(idx(b).estado, 'ninguna', b)
  assert.equal(casarCompaniaActual([], 'Mapfre').estado, 'ninguna')
  assert.equal(casarCompaniaActual(LISTA, null).estado, 'ninguna')
})

test('el nombre del riesgo más largo que la opción casa por el alias (nivel 4)', () => {
  assert.deepEqual(casarCompaniaActual(['REALE AUTOS', 'PELAYO/PELAYONEX'], 'Reale Autos Seguros Sociedad Anonima').indices, [0])
  assert.equal(casarCompaniaActual(['NU', 'ZZ'], 'nu zz yy').estado, 'ninguna', 'alias de menos de 3 letras: no cuenta')
})

test('mensajes: la ambigua nombra las candidatas; la que no casa lleva la lista; nada de datos personales', () => {
  const m = mensajeCompaniaAmbigua('Allianz', [LISTA[9], LISTA[10]])
  assert.match(m, /casa con 2 opciones/)
  assert.match(m, /ALLIANZ DIRECT/)
  assert.match(m, /BBVA ALLIANZ/)
  const n = mensajeCompaniaNoCasa('Compañía Inexistente', LISTA)
  assert.match(n, /no está en la lista de Allianz/)
  assert.match(n, /opciones leídas \(11\)/)
  assert.ok(n.length <= 1_500)
})

// Antes del login: cambio de seguro sin compañía actual en el riesgo → `datos` (la pantalla la pide), no «mapa incompleto».
const FORM = { ramo: 'auto', matricula: '0000XXX', codigoPostal: '41003', conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' } } as unknown as FormularioAuto
test('exigirCompaniaActualTurismos: ya lo tenía sin compañía actual → ErrorTarificador datos; con ella o vehículo nuevo, pasa', () => {
  const HOY = new Date('2026-10-19T10:00:00Z')
  assert.throws(() => exigirCompaniaActualTurismos(FORM, HOY), (e: unknown) => e instanceof ErrorTarificador && e.tipo === 'datos' && e.message === MENSAJE_FALTA_COMPANIA_ACTUAL)
  assert.match(MENSAJE_FALTA_COMPANIA_ACTUAL, /falta la compañía actual del vehículo; Allianz la exige con cambio de seguro/)
  assert.doesNotThrow(() => exigirCompaniaActualTurismos({ ...FORM, companiaAnterior: 'Reale' }, HOY))
  assert.doesNotThrow(() => exigirCompaniaActualTurismos({ ...FORM, fechaMatriculacion: '2026-10-01' }, HOY), 'matriculado hace días y sin póliza: nuevo, no se exige')
})
