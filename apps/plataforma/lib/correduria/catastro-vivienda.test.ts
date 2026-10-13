import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consultaCatastroDeForm, precargaCatastroVivienda, type CatastroVivienda } from './catastro-vivienda.ts'

const cat: CatastroVivienda = {
  metrosCuadrados: 76, anioConstruccion: 1994, direccion: 'CL SAN VICENTE 40 Pl:02 Pt:14', localidad: 'SEVILLA', provincia: 'SEVILLA', codigoPostal: '41002',
}
const REF = '4825101TG3442E0015JW'

test('rellena SOLO lo vacío del formulario', () => {
  const r = precargaCatastroVivienda({ referenciaCatastral: '', metrosCuadrados: '', anioConstruccion: '', cp: '', direccion: '', municipio: '', provincia: '' }, REF, cat)
  assert.deepEqual(r.cambios, { referenciaCatastral: REF, direccion: 'CL SAN VICENTE 40 Pl:02 Pt:14', cp: '41002', municipio: 'SEVILLA', provincia: 'SEVILLA', metrosCuadrados: '76', anioConstruccion: '1994' })
  assert.deepEqual(r.distintos, [])
})

test('lo ya escrito NO se pisa: si el Catastro dice otra cosa, se enseña como diferencia', () => {
  const r = precargaCatastroVivienda({ metrosCuadrados: '90', cp: '41002', referenciaCatastral: REF.toLowerCase() }, REF, cat)
  assert.equal(r.cambios.metrosCuadrados, undefined)
  assert.deepEqual(r.distintos, [{ campo: 'metrosCuadrados', escrito: '90', catastro: '76' }])
  // La misma referencia en minúsculas no es «distinta».
  assert.ok(!r.distintos.some((d) => d.campo === 'referenciaCatastral'))
})

test('lo que el Catastro no trae NO se convierte en 0 ni en vacío: sigue sin dato', () => {
  const r = precargaCatastroVivienda({}, REF, { metrosCuadrados: null, anioConstruccion: null, direccion: null, localidad: null, provincia: null, codigoPostal: null })
  assert.deepEqual(r.cambios, { referenciaCatastral: REF })
  const cero = precargaCatastroVivienda({}, null, { ...cat, metrosCuadrados: 0, codigoPostal: '410' })
  assert.equal(cero.cambios.metrosCuadrados, undefined, '0 m² no es una superficie')
  assert.equal(cero.cambios.cp, undefined, 'un CP que no son 5 cifras no se escribe')
  assert.equal(cero.cambios.referenciaCatastral, undefined)
})

test('consulta: la referencia escrita manda; si no, calle + número + municipio + provincia; si falta, se dice', () => {
  assert.deepEqual(consultaCatastroDeForm({ referenciaCatastral: ` ${REF} `, nombreVia: 'X' }, null), { ok: true, cuerpo: { referencia: REF } })
  assert.deepEqual(
    consultaCatastroDeForm({ nombreVia: 'San Vicente', numeroVia: '40', municipio: 'Sevilla', provincia: 'Sevilla', tipoViaId: 'CL' }, 'Calle'),
    { ok: true, cuerpo: { direccion: 'Calle San Vicente 40', municipio: 'Sevilla', provincia: 'Sevilla' } },
  )
  const sinMunicipio = consultaCatastroDeForm({ nombreVia: 'San Vicente', numeroVia: '40' }, null)
  assert.equal(sinMunicipio.ok, false)
  const nada = consultaCatastroDeForm({}, null)
  assert.equal(nada.ok, false)
})
