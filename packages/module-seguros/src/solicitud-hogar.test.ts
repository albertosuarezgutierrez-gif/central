import test from 'node:test'
import assert from 'node:assert/strict'
import { direccionDeRespuestas, direccionLegible, planEscrituraVivienda, plantaLegible, textoCatastroSolicitud, viviendaDeSolicitud } from './solicitud-hogar.ts'

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

const PROP = {
  cp: '41003', provincia: 'SEVILLA', municipio: 'SEVILLA', nombreVia: 'SOCORRO', numeroVia: '24', planta: '2', puertaVivienda: 'B', direccion: 'CL SOCORRO 24, 2º B',
  referenciaCatastral: '1234567AB1234C0001XY', catastroReferencia: '1234567AB1234C0001XY', metrosCuadrados: 90, anioConstruccion: 1975,
  hipoteca: true, bancoHipoteca: 'Caixabank', capitalContenido: 30000,
}

test('por BLOQUES: con todo vacío se escribe todo', () => {
  const p = planEscrituraVivienda(null, PROP)
  assert.deepEqual(p.conflictos, [])
  assert.equal(p.escribir.cp, '41003')
  assert.equal(p.escribir.referenciaCatastral, '1234567AB1234C0001XY')
})

test('dirección: si había otra, NO se mezcla campo a campo (ni el municipio vacío se rellena) y se avisa', () => {
  const p = planEscrituraVivienda({ cp: '41001', municipio: null, nombreVia: 'SIERPES', numeroVia: '3' }, PROP)
  for (const k of ['cp', 'municipio', 'provincia', 'nombreVia', 'numeroVia', 'planta', 'puertaVivienda', 'direccion']) assert.equal(k in p.escribir, false, k)
  assert.match(p.conflictos.join(' '), /dirección distinta de la guardada: revisar/)
  // La misma dirección (otra grafía) no es conflicto, y no se reescribe.
  const igual = planEscrituraVivienda({ cp: '41003', nombreVia: 'Socorro', numeroVia: '24', planta: '2º' }, PROP)
  assert.equal(igual.conflictos.some((c) => /dirección/.test(c)), false)
  assert.equal('cp' in igual.escribir, false)
})

test('Catastro: otra referencia previa → nada del Catastro y aviso; la misma → solo los metadatos y lo que falte', () => {
  const otra = planEscrituraVivienda({ referenciaCatastral: '9999999ZZ9999Z0001AA' }, PROP)
  for (const k of ['referenciaCatastral', 'metrosCuadrados', 'anioConstruccion', 'catastroReferencia']) assert.equal(k in otra.escribir, false, k)
  assert.match(otra.conflictos.join(' '), /referencia catastral distinta/)
  const misma = planEscrituraVivienda({ referenciaCatastral: '1234567ab1234c0001xy', metrosCuadrados: 85 }, PROP)
  assert.equal('metrosCuadrados' in misma.escribir, false, 'los m² que escribió la correduría mandan')
  assert.equal(misma.escribir.anioConstruccion, 1975)
  assert.equal(misma.escribir.catastroReferencia, '1234567AB1234C0001XY')
})

test('hipoteca y banco van juntos; el contenido solo si no estaba; un bloque CONFIRMADO no se toca', () => {
  const p = planEscrituraVivienda({ hipoteca: false, capitalContenido: 20000 }, PROP)
  assert.equal('hipoteca' in p.escribir || 'bancoHipoteca' in p.escribir, false)
  assert.match(p.conflictos.join(' '), /hipoteca declarada distinta/)
  assert.equal('capitalContenido' in p.escribir, false)
  const conf = planEscrituraVivienda(null, PROP, '2026-10-20T10:00:00Z')
  assert.deepEqual(conf, { escribir: {}, conflictos: [], confirmado: true })
})

test('planta legible: «º» solo a un número pelado', () => {
  assert.equal(plantaLegible('2'), '2º')
  assert.equal(plantaLegible('2º'), '2º')
  assert.equal(plantaLegible('Bajo'), 'Bajo')
  assert.equal(plantaLegible(' '), null)
  const d = direccionDeRespuestas({ viviendaCp: '41003', viviendaCalle: 'Socorro', viviendaNumero: '24', viviendaPlanta: 'Bajo', viviendaPuerta: 'A' })
  assert.equal(direccionLegible(d!), 'Socorro 24, Bajo A · 41003')
})

test('el texto del Catastro distingue «no respondió» de «no existe» y de «varios»', () => {
  assert.match(textoCatastroSolicitud({ estado: 'error' }), /no respondió/)
  assert.match(textoCatastroSolicitud({ estado: 'no_encontrado' }), /no encuentra/)
  assert.match(textoCatastroSolicitud({ estado: 'varios' }), /varios pisos/)
  assert.match(textoCatastroSolicitud({ estado: 'ok', referencia: 'X', metrosCuadrados: 90, anioConstruccion: null, uso: 'Comercial' }), /90 m² · año sin dato · ⚠️ uso catastral «Comercial»/)
  assert.equal(textoCatastroSolicitud(null), 'Catastro sin consultar')
})
