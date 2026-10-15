// Mapfre HOGAR (borrador, 15/10/2026): lector de prima con el formato del presupuesto, elección de fila de catastro, referencia
// catastral del riesgo y que el adaptador NO está registrado. Fixtures SINTÉTICOS: ningún dato personal ni importe real.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { validarFormularioHogar, type FormularioHogar } from '@central/module-tarificacion'
import { adaptadores } from '../src/adapters/index.ts'
import {
  MAPFRE_HOGAR_ACTIVO,
  PROTECCIONES_MAPEADAS,
  SEL_HOGAR,
  ErrorMapaIncompleto,
  exigirDatosHogar,
  importeDePrimaHogar,
  indiceFilaCatastro,
  mapfreHogar,
  ofertasDesdePrimasHogar,
  partesFilaCatastro,
  primasDesdeTextoPrecio,
  referenciaCatastralDe,
} from '../src/adapters/mapfre/hogar.ts'

const RC = '0000000AA0000A0001BC'
const FORM = (rc?: string): FormularioHogar => ({
  ramo: 'hogar',
  tomador: { documentoIdentidad: '00000000T', fechaNacimiento: '1980-01-02' },
  inmueble: { codigoPostal: '41001', municipio: null, nombreVia: 'Calle Ficticia', numero: '1', bloque: null, escalera: null, planta: '1', puerta: 'IZ', anioConstruccion: 1990, anioReforma: null, superficieM2: 80, ...(rc ? { referenciaCatastral: rc } : {}) },
  hogar: { uso: 'habitual', regimen: 'propietario', tipoVivienda: 'piso', conMadera: false, capitalContinenteEur: null, capitalContenidoEur: null },
})

// Cuadro «PRIMA DEL SEGURO» con el formato del PDF (importes inventados).
const CUADRO = `PRIMA DEL SEGURO
HOGAR TÚ ELIGES HOGAR FAMILIAR HOGAR PLATINO
ANUAL
Prima total 100,10 € 200,20 € 1.300,30 €
Primer recibo 100,10 € 200,20 € 1.300,30 €
Sucesivos ** ** **
SEMESTRAL
Prima total 110,11 € 210,21 € 1.310,31 €
Primer recibo 55,06 € 105,11 € 655,16 €`

test('importeDePrimaHogar: formato del presupuesto (coma decimal, miles con punto, € detrás)', () => {
  assert.equal(importeDePrimaHogar('275,80 €'), 275.8)
  assert.equal(importeDePrimaHogar('1.234,56 €'), 1234.56)
  assert.equal(importeDePrimaHogar('**'), null)
  assert.equal(importeDePrimaHogar('275,8 €'), null)
  assert.equal(importeDePrimaHogar('275.80 €'), null)
  assert.equal(importeDePrimaHogar('0,00 €'), null)
})

test('primasDesdeTextoPrecio: una prima ANUAL por modalidad; semestral y trimestral se ignoran', () => {
  const p = primasDesdeTextoPrecio(CUADRO)
  assert.deepEqual(p.map((x) => [x.modalidad, x.primaAnualEur, x.primerReciboEur]), [
    ['HOGAR TÚ ELIGES', 100.1, 100.1],
    ['HOGAR FAMILIAR', 200.2, 200.2],
    ['HOGAR PLATINO', 1300.3, 1300.3],
  ])
})

test('primasDesdeTextoPrecio es fail-closed: sin cabecera, sin ANUAL o con un importe de menos → []', () => {
  assert.deepEqual(primasDesdeTextoPrecio('ANUAL Prima total 100,10 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio('HOGAR TÚ ELIGES HOGAR FAMILIAR\nSEMESTRAL\nPrima total 1,00 € 2,00 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio('HOGAR TÚ ELIGES HOGAR FAMILIAR HOGAR PLATINO\nANUAL\nPrima total 100,10 € 200,20 €'), [])
  assert.deepEqual(primasDesdeTextoPrecio(''), [])
})

test('ofertasDesdePrimasHogar: una oferta por modalidad, sin garantías inventadas', () => {
  const o = ofertasDesdePrimasHogar(primasDesdeTextoPrecio(CUADRO))
  assert.equal(o.length, 3)
  assert.equal(o[0]!.producto, 'Hogar · HOGAR TÚ ELIGES')
  assert.equal(o[0]!.fraccionamiento, 'anual')
  assert.deepEqual(o[0]!.coberturas, [])
  assert.ok(o[0]!.avisos.some((a) => /Garant/.test(a)))
})

test('referencia catastral: solo 20 caracteres; sin ella el riesgo es `datos` (no hay buscador por dirección)', () => {
  assert.equal(referenciaCatastralDe(FORM(RC)), RC)
  assert.equal(referenciaCatastralDe(FORM('0000000AA0000A')), null)
  assert.equal(referenciaCatastralDe(FORM()), null)
  assert.equal(exigirDatosHogar(FORM(RC)), RC)
  assert.throws(() => exigirDatosHogar(FORM()), (e: Error & { tipo?: string }) => e.tipo === 'datos' && !e.message.includes('Ficticia'))
})

test('validarFormularioHogar conserva la referencia catastral normalizada y rechaza una mal formada', () => {
  const crudo = (rc: string) => ({ ...FORM(), inmueble: { ...FORM().inmueble, referenciaCatastral: rc } })
  const ok = validarFormularioHogar(crudo(' 0000000aa0000a0001bc '), new Date('2026-10-15T00:00:00Z'))
  assert.ok(ok.ok && ok.formulario.inmueble.referenciaCatastral === RC)
  const mal = validarFormularioHogar(crudo('XX'), new Date('2026-10-15T00:00:00Z'))
  assert.ok(!mal.ok && mal.errores.some((e) => e.startsWith('inmueble.referenciaCatastral')))
})

test('fila de catastro: una sola → 0; varias → la única que casa por escalera/planta/puerta; si no, requiere_humano con opciones', () => {
  const f = (s: string) => ({ descripcion: s })
  assert.deepEqual(partesFilaCatastro('CL FICTICIA 0001 Es:1 Pl:01 Pt:IZ'), { escalera: '1', planta: '01', puerta: 'IZ' })
  assert.equal(indiceFilaCatastro([f('CL X 0001 Es:1 Pl:02 Pt:DR')], { escalera: null, planta: '1', puerta: 'IZ' }), 0)
  const varias = [f('CL X 0001 Es:1 Pl:01 Pt:DR'), f('CL X 0001 Es:1 Pl:01 Pt:IZ'), f('CL X 0001 Es:1 Pl:02 Pt:IZ')]
  assert.equal(indiceFilaCatastro(varias, { escalera: null, planta: '1', puerta: 'Izquierda' }), 1)
  assert.throws(() => indiceFilaCatastro(varias, { escalera: null, planta: null, puerta: null }), (e: Error & { tipo?: string; opciones?: unknown[] }) => e.name === 'ErrorEleccionVersion' && e.tipo === 'eleccion' && e.opciones?.length === 3)
  assert.throws(() => indiceFilaCatastro([f('CL X Es:1 Pl:01 Pt:IZ'), f('CL X Es:2 Pl:01 Pt:IZ')], { escalera: null, planta: '1', puerta: 'IZ' }), (e: Error) => e.name === 'ErrorEleccionVersion')
  assert.throws(() => indiceFilaCatastro([], { escalera: null, planta: null, puerta: null }), (e: Error & { tipo?: string }) => e.tipo === 'datos')
})

test('NO está registrado: flag apagado y fuera de adapters/index.ts', () => {
  assert.equal(MAPFRE_HOGAR_ACTIVO, false)
  assert.equal(adaptadores.obtener('mapfre', 'hogar'), null)
  assert.ok(!adaptadores.claves().some((k) => k.includes('mapfre') && k.includes('hogar')))
  assert.ok(!/mapfre\/hogar/.test(readFileSync(new URL('../src/adapters/index.ts', import.meta.url), 'utf8')))
})

test('huecos explícitos: sin selector de la referencia ni mapa de protecciones; apagado, tarificar ni abre el navegador', async () => {
  assert.equal(SEL_HOGAR.referenciaCatastral, null)
  assert.equal(PROTECCIONES_MAPEADAS, false)
  await assert.rejects(() => mapfreHogar.tarificar(null as never, FORM(RC), null as never), (e: Error & { tipo?: string }) => e.tipo === 'datos' && /apagado/.test(e.message))
  assert.equal(new ErrorMapaIncompleto('x').pideInventarioDom, true)
})

test('el borrador no nombra acciones de emisión ni de impresión como acción', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/hogar.ts', import.meta.url), 'utf8')
  const codigo = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n')
  assert.ok(!/imprimir|contratar|emitir|\.click\(|grabar/i.test(codigo.replace(/«[^»]*»/g, '')))
})
