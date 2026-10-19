import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { puedeEscribirCatastro, cambiosViviendaDesdeCatastro, conocidosDeVivienda, elegirViviendaCatastro, lineaCatastroTelegram, type DatosCatastroLead } from './lead-correduria-catastro.ts'

const VIV: DatosCatastroLead = { metrosCuadrados: 68, anioConstruccion: 1992, direccion: 'CL EJEMPLO 1 Es:1 Pl:02 Pt:B', localidad: 'DOS HERMANAS', provincia: 'SEVILLA', codigoPostal: '41700', uso: 'Residencial' }
const GARAJE: DatosCatastroLead = { ...VIV, metrosCuadrados: 12, uso: 'Almacen-Estacionamiento' }

test('🪤 vivienda + garaje: se elige la residencial; dos residenciales = no se elige a ciegas', () => {
  const e = elegirViviendaCatastro([{ referencia: 'G', datos: GARAJE }, { referencia: 'V', datos: VIV }])
  assert.equal(e.estado, 'ok')
  if (e.estado === 'ok') assert.equal(e.referencia, 'V')
  assert.equal(elegirViviendaCatastro([{ referencia: 'A', datos: VIV }, { referencia: 'B', datos: VIV }]).estado, 'ambiguo')
  assert.equal(elegirViviendaCatastro([{ referencia: 'A', datos: null }]).estado, 'sin_dato', 'Catastro caído = no se sabe')
})

test('🪤 nunca pisa un dato que ya está en el riesgo: solo rellena lo vacío', () => {
  const r = cambiosViviendaDesdeCatastro({ metrosCuadrados: 75, cp: null, referenciaCatastral: null }, '9872023VH5797S0001WX', VIV)
  assert.equal('metrosCuadrados' in r.cambios, false, 'los 75 m² del cliente no se tocan')
  assert.deepEqual(r.distintos, ['metrosCuadrados'])
  assert.equal(r.cambios.cp, '41700')
  assert.equal(r.cambios.anioConstruccion, 1992)
  assert.equal(r.cambios.referenciaCatastral, '9872023VH5797S0001WX')
  // Un dato que el Catastro no trae no se convierte en 0 ni en ''.
  const sin = cambiosViviendaDesdeCatastro(null, 'R', { ...VIV, metrosCuadrados: null, anioConstruccion: null })
  assert.equal('metrosCuadrados' in sin.cambios, false)
  assert.equal('anioConstruccion' in sin.cambios, false)
})

test('lo que ya no se pregunta = lo que quedó en el riesgo', () => {
  assert.deepEqual(conocidosDeVivienda({}), [])
  assert.deepEqual(conocidosDeVivienda({ cp: '41700', direccion: 'CL X 1', metrosCuadrados: 68 }).sort(), ['cp', 'metrosCuadrados', 'nombreVia', 'numeroVia', 'planta', 'tipoViaId'].sort())
})

test('la línea de Telegram: m², año, uso y CP, sin la calle', () => {
  const l = lineaCatastroTelegram({ estado: 'ok', datos: VIV, guardado: 'si', distintos: [] })
  assert.match(l, /68 m²/)
  assert.match(l, /1992/)
  assert.match(l, /41700 DOS HERMANAS/)
  assert.ok(!l.includes('EJEMPLO'), 'la calle no va a Telegram')
  assert.match(lineaCatastroTelegram({ estado: 'fallo' }), /no se sabe/)
})

test('🪤 el Catastro solo escribe en la oportunidad que abrió ESTE correo y sin riesgo confirmado', () => {
  assert.equal(puedeEscribirCatastro({ recienAbierta: true, confirmadoAt: null }), true)
  assert.equal(puedeEscribirCatastro({ recienAbierta: true, confirmadoAt: '2026-10-18T10:00:00Z' }), false, 'escribir sin confirmar borraría el confirmadoAt de Alberto')
  assert.equal(puedeEscribirCatastro({ recienAbierta: false, confirmadoAt: null }), false, 'una oportunidad que ya existía no se toca desde un correo')
  assert.match(lineaCatastroTelegram({ estado: 'ok', datos: VIV, guardado: 'protegido', distintos: [] }), /solo te lo enseño/)
  const src = readFileSync(new URL('./lead-correduria-pendiente.ts', import.meta.url), 'utf8')
  assert.ok(src.indexOf('puedeEscribirCatastro({') > 0 && src.indexOf('puedeEscribirCatastro({') < src.indexOf('datosRiesgoAsegura({'), 'la guarda va ANTES de escribir')
  const proc = readFileSync(new URL('./lead-correduria-proceso.ts', import.meta.url), 'utf8')
  assert.match(proc, /recienAbierta: op\.estado === 'abierta'/)
})
