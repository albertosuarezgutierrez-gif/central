import assert from 'node:assert/strict'
import { test } from 'node:test'
import { avisoUsoCatastral, consultaCatastroDeForm, metadatosConsultaCatastro, partirViaCatastro, precargaCatastroVivienda, type CatastroVivienda } from './catastro-vivienda.ts'

const cat: CatastroVivienda = {
  metrosCuadrados: 76, anioConstruccion: 1994, direccion: 'CL SAN VICENTE 40 Pl:02 Pt:14', localidad: 'SEVILLA', provincia: 'SEVILLA', codigoPostal: '41002',
}
const REF = '4825101TG3442E0015JW'

test('rellena SOLO lo vacío del formulario', () => {
  const r = precargaCatastroVivienda({ referenciaCatastral: '', metrosCuadrados: '', anioConstruccion: '', cp: '', direccion: '', municipio: '', provincia: '' }, REF, cat)
  assert.deepEqual(r.cambios, { referenciaCatastral: REF, direccion: 'CL SAN VICENTE 40 Pl:02 Pt:14', nombreVia: 'SAN VICENTE', numeroVia: '40', planta: '2', puertaVivienda: '14', cp: '41002', municipio: 'SEVILLA', provincia: 'SEVILLA', metrosCuadrados: '76', anioConstruccion: '1994' })
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
  assert.deepEqual(Object.keys(precargaCatastroVivienda({}, REF, { ...cat, direccion: null }).cambios), ['referenciaCatastral', 'cp', 'municipio', 'provincia', 'metrosCuadrados', 'anioConstruccion'], 'sin dirección no hay calle, número, planta ni puerta')
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

// 19/10/2026: calle, número, planta y puerta salen de la dirección del Catastro SOLO si tiene la forma esperada.
test('partirViaCatastro: sigla + nombre + número (+ interior, CP y municipio opcionales)', () => {
  assert.deepEqual(partirViaCatastro('CL SAN VICENTE 40 Pl:02 Pt:14'), { nombreVia: 'SAN VICENTE', numeroVia: '40', planta: '2', puerta: '14' })
  assert.deepEqual(partirViaCatastro('AV JUAN ANT RUIZ 43 Es:1 Pl:01 Pt:IZ 41807 ESPARTINAS'), { nombreVia: 'JUAN ANT RUIZ', numeroVia: '43', planta: '1', puerta: 'IZ' })
  assert.deepEqual(partirViaCatastro('CL PRUEBA 12B'), { nombreVia: 'PRUEBA', numeroVia: '12B', planta: null, puerta: null })
})

test('partirViaCatastro: planta baja («00») y lo ilegible quedan SIN DATO (no se supone); S/N no es un número', () => {
  assert.equal(partirViaCatastro('CL PRUEBA 5 Pl:00 Pt:A').planta, null)
  assert.equal(partirViaCatastro('CL PRUEBA 5 Pl:AT Pt:A').planta, 'AT')
  assert.deepEqual(partirViaCatastro('CL PRUEBA S/N'), { nombreVia: null, numeroVia: null, planta: null, puerta: null })
  assert.deepEqual(partirViaCatastro('PRUEBA 5'), { nombreVia: null, numeroVia: null, planta: null, puerta: null })
  for (const raro of [null, undefined, '', '   ']) assert.deepEqual(partirViaCatastro(raro), { nombreVia: null, numeroVia: null, planta: null, puerta: null })
})

test('precarga: calle/número/planta/puerta del Catastro se rellenan SOLO si estaban vacíos; lo escrito no se pisa', () => {
  const r = precargaCatastroVivienda({ nombreVia: 'Otra Calle', numeroVia: '', planta: '2' }, REF, cat)
  assert.equal(r.cambios.numeroVia, '40')
  assert.equal(r.cambios.puertaVivienda, '14')
  assert.equal(r.cambios.nombreVia, undefined)
  assert.deepEqual(r.distintos.map((d) => d.campo), ['nombreVia'], 'la planta escrita coincide: no es una diferencia')
})

test('uso catastral: solo informa. Residencial no alarma; otro uso o sin uso avisa; nunca decide el uso del seguro', () => {
  assert.match(avisoUsoCatastral('Residencial')!, /Es informativo: el uso del seguro/)
  assert.match(avisoUsoCatastral('Comercial')!, /no como vivienda/)
  assert.match(avisoUsoCatastral(null)!, /no informa el uso/)
  const conUso = precargaCatastroVivienda({}, REF, { ...cat, uso: 'Residencial' })
  assert.ok(!('uso' in conUso.cambios) && !('ocupacion' in conUso.cambios), 'el uso catastral no rellena ningún campo del formulario')
})

test('metadatosConsultaCatastro: guarda referencia, fecha, uso, m² y año; lo que no trae queda vacío (nunca 0)', () => {
  const ahora = '2026-10-20T09:00:00.000Z'
  assert.deepEqual(metadatosConsultaCatastro({ ...cat, uso: 'Residencial' }, REF.toLowerCase(), ahora), {
    catastroConsultadoAt: ahora, catastroReferencia: REF, usoCatastral: 'Residencial', catastroMetrosCuadrados: '76', catastroMetrosVivienda: '',
    catastroMetrosAnexos: '', catastroAnexos: '', catastroAnioConstruccion: '1994',
  })
  const vacio = metadatosConsultaCatastro({ ...cat, metrosCuadrados: 0, anioConstruccion: null, uso: null }, REF, ahora)
  assert.equal(vacio.catastroMetrosCuadrados, '')
  assert.equal(vacio.catastroAnioConstruccion, '')
  assert.equal(vacio.usoCatastral, '')
})

test('228 m² construidos = vivienda 143 + anexos 85: se DECLARA el total (228); la vivienda y los anexos solo se guardan para mostrarlos', () => {
  const c: CatastroVivienda = { ...cat, metrosCuadrados: 228, metrosVivienda: 143, anexos: [{ uso: 'APARCAMIENTO', superficie: 54 }, { uso: 'ALMACEN', superficie: 31 }] }
  assert.equal(precargaCatastroVivienda({}, REF, c).cambios.metrosCuadrados, '228')
  const m = metadatosConsultaCatastro(c, REF, 'x')
  assert.equal(m.catastroMetrosCuadrados, '228')
  assert.equal(m.catastroMetrosVivienda, '143')
  assert.equal(m.catastroMetrosAnexos, '85')
  assert.equal(m.catastroAnexos, 'Aparcamiento 54 m² · Almacen 31 m²')
})
