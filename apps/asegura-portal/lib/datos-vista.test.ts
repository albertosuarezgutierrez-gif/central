import test from 'node:test'
import assert from 'node:assert/strict'
import { camposSolicitud, NADA_CONOCIDO } from '@central/module-seguros'
import { esencialesPendientes, opcionesVisibles, textoTarjetaVivienda, visibleSegunCatastro, type ContextoVista } from './datos-vista.ts'

const campos = camposSolicitud('hogar', NADA_CONOCIDO)
const por = (k: string) => campos.find((c) => c.clave === k)!
const OK = { estado: 'ok' as const, tipo: 'piso' as const, metros: 85, anio: 1998 }
const ctx = (p: Partial<ContextoVista>): ContextoVista => ({ catastro: null, confirmado: null, tipoElegido: null, ...p })

test('tarjeta: «Piso · 2º · 85 m² · 1998»; sin Catastro no sale', () => {
  assert.equal(textoTarjetaVivienda(OK, '2'), 'Piso · 2º · 85 m² · 1998')
  assert.equal(textoTarjetaVivienda({ ...OK, metros: 1250 }, '2'), 'Piso · 2º · 1.250 m² · 1998')
  assert.equal(textoTarjetaVivienda({ ...OK, tipo: 'unifamiliar' }, ''), 'Casa · 85 m² · 1998')
  assert.equal(textoTarjetaVivienda(null, '2'), null)
  assert.equal(textoTarjetaVivienda({ estado: 'sin_datos', tipo: null, metros: null, anio: null }, '2'), null)
  assert.equal(visibleSegunCatastro(por('confirmaCatastro'), ctx({}), '2'), false)
  assert.equal(visibleSegunCatastro(por('confirmaCatastro'), ctx({ catastro: OK }), '2'), true)
})

test('lo que da el Catastro no se pregunta si se confirma; sin Catastro, o al corregir, sí', () => {
  for (const k of ['tipoVivienda', 'metrosCuadrados', 'anioConstruccion']) {
    assert.equal(visibleSegunCatastro(por(k), ctx({}), '2'), true, `${k} sin Catastro`)
    assert.equal(visibleSegunCatastro(por(k), ctx({ catastro: OK }), '2'), true, `${k} sin confirmar aún`)
    assert.equal(visibleSegunCatastro(por(k), ctx({ catastro: OK, confirmado: true }), '2'), false, `${k} confirmado`)
    assert.equal(visibleSegunCatastro(por(k), ctx({ catastro: OK, confirmado: false }), '2'), true, `${k} corregir`)
  }
  // Catastro sin año: el año se pregunta aunque confirme.
  assert.equal(visibleSegunCatastro(por('anioConstruccion'), ctx({ catastro: { ...OK, anio: null }, confirmado: true }), '2'), true)
})

test('casa: el tipo se pregunta solo entre adosada e independiente', () => {
  const c = ctx({ catastro: { ...OK, tipo: 'unifamiliar' }, confirmado: true })
  assert.equal(visibleSegunCatastro(por('tipoVivienda'), c, ''), true)
  assert.deepEqual(opcionesVisibles(por('tipoVivienda'), c)?.map((o) => o.valor), ['adosada', 'independiente'])
})

test('rejas: en piso o ático no se preguntan; en bajo, casa o sin saber el tipo, sí', () => {
  const r = por('ventanasSeguras')
  assert.equal(visibleSegunCatastro(r, ctx({ catastro: OK }), '2'), false)
  assert.equal(visibleSegunCatastro(r, ctx({ catastro: { ...OK, tipo: 'planta_baja' } }), '0'), true)
  assert.equal(visibleSegunCatastro(r, ctx({}), ''), true)
  assert.equal(visibleSegunCatastro(r, ctx({ tipoElegido: 'adosada' }), ''), true)
  assert.equal(visibleSegunCatastro(r, ctx({ tipoElegido: 'atico' }), ''), false)
})

test('esenciales que dependen del Catastro: sin contestar ni «No lo sé» no se envía', () => {
  const vis = [por('tipoVivienda'), por('tramoContenido'), por('conMadera')]
  assert.deepEqual(esencialesPendientes(vis, {}, new Set()), ['tipoVivienda', 'tramoContenido'])
  assert.deepEqual(esencialesPendientes(vis, { tramoContenido: 'calcular' }, new Set(['tipoVivienda'])), [])
})
