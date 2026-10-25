import test from 'node:test'
import assert from 'node:assert/strict'
import { direccionDeRespuestas, direccionLegible, soloHuecos, textoCatastroSolicitud, viviendaDeSolicitud } from './solicitud-hogar.ts'

const R = {
  viviendaCp: '41003', viviendaProvincia: 'SEVILLA', viviendaMunicipio: 'SEVILLA', viviendaCalle: 'Calle Socorro', viviendaNumero: '24',
  viviendaPlanta: '2', viviendaPuerta: 'B', viviendaViaTipo: 'CL', viviendaViaNombre: 'SOCORRO',
  valorContenido: null, hipoteca: true, paraBanco: true, entidadHipoteca: 'Caixabank',
}
const AHORA = '2026-10-25T10:00:00.000Z'

test('dirección legible con la calle oficial', () => {
  const d = direccionDeRespuestas(R)
  assert.ok(d)
  assert.equal(direccionLegible(d!), 'CL SOCORRO 24, 2º B · 41003 SEVILLA')
  assert.equal(direccionDeRespuestas({}), null)
})

test('vivienda: lo que no se sabe no se escribe (contenido en blanco ≠ 0) y el Catastro solo con inmueble inequívoco', () => {
  const sin = viviendaDeSolicitud(R, { estado: 'varios' }, AHORA)
  assert.equal('capitalContenido' in sin, false)
  assert.equal('referenciaCatastral' in sin, false)
  assert.equal('metrosCuadrados' in sin, false)
  assert.equal(sin.nombreVia, 'SOCORRO')
  assert.equal(sin.bancoHipoteca, 'Caixabank')
  const con = viviendaDeSolicitud({ ...R, valorContenido: 30000 }, { estado: 'ok', referencia: '1234567AB1234C0001XY', metrosCuadrados: 0, anioConstruccion: 1975, uso: 'Residencial' }, AHORA)
  assert.equal(con.capitalContenido, 30000)
  assert.equal(con.referenciaCatastral, '1234567AB1234C0001XY')
  assert.equal(con.anioConstruccion, 1975)
  assert.equal('metrosCuadrados' in con, false, '0 m² del Catastro = sin dato')
  assert.equal(con.catastroConsultadoAt, AHORA)
})

test('solo huecos: lo que la correduría ya tenía no se pisa', () => {
  assert.deepEqual(soloHuecos({ cp: '41001', municipio: null, planta: '' }, { cp: '41003', municipio: 'SEVILLA', planta: '2' }), { municipio: 'SEVILLA', planta: '2' })
  assert.deepEqual(soloHuecos(null, { cp: '41003' }), { cp: '41003' })
})

test('el texto del Catastro distingue «no respondió» de «no existe» y de «varios»', () => {
  assert.match(textoCatastroSolicitud({ estado: 'error' }), /no respondió/)
  assert.match(textoCatastroSolicitud({ estado: 'no_encontrado' }), /no encuentra/)
  assert.match(textoCatastroSolicitud({ estado: 'varios' }), /varios pisos/)
  assert.match(textoCatastroSolicitud({ estado: 'ok', referencia: 'X', metrosCuadrados: 90, anioConstruccion: null, uso: 'Comercial' }), /90 m² · año sin dato · ⚠️ uso catastral «Comercial»/)
  assert.equal(textoCatastroSolicitud(null), 'Catastro sin consultar')
})
