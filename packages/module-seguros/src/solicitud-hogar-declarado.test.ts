// 05/11/2026 — Lo que el cliente DECLARA de uso, régimen y tipo de vivienda llega a `datosVivienda` también en la CLAVE del bot
// (`usoDeclarado`, `regimenDeclarado`, `tipoViviendaDeclarado`): sin id de Codeoscopic atestiguado (segunda residencia, casa…) no
// había dónde ponerlo y el bot lo seguía echando en falta. Nunca pisa lo guardado y el modelo lo acepta. Datos sintéticos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planEscrituraVivienda, viviendaDeSolicitud } from './solicitud-hogar.ts'
import { validarDatosViviendaRiesgo } from './datos-vivienda-riesgo.ts'
import { claveBotDeOpcion } from './solicitud-destinos.ts'

const AHORA = '2026-11-05T10:00:00.000Z'

test('declarado → clave del bot, aunque no haya id atestiguado', () => {
  const out = viviendaDeSolicitud({ regimen: 'inquilino', usoVivienda: 'secundaria', tipoVivienda: 'adosada' }, null, AHORA)
  assert.equal(out.regimenDeclarado, 'inquilino')
  assert.equal(out.usoDeclarado, 'secundaria')
  assert.equal(out.tipoViviendaDeclarado, 'adosada')
  assert.ok(!('ocupacion' in out) && !('tipoVivienda' in out), 'sin id atestiguado, el campo del catálogo sigue vacío')
  assert.ok(validarDatosViviendaRiesgo(out, { hoy: AHORA.slice(0, 10) }).ok)
})

test('«alquilada» del formulario = «alquiler» del bot; una opción desconocida no se escribe', () => {
  assert.equal(claveBotDeOpcion('usoVivienda', 'alquilada'), 'alquiler')
  assert.equal(claveBotDeOpcion('usoVivienda', 'otro'), null)
  assert.ok(!('usoDeclarado' in viviendaDeSolicitud({ usoVivienda: 'otro' }, null, AHORA)))
})

test('el último piso deducido del Catastro NO se declara «piso»', () => {
  const out = viviendaDeSolicitud({ confirmaCatastro: true }, null, AHORA, { tipo: 'piso', ultimoPiso: 'ultimo' })
  assert.ok(!('tipoViviendaDeclarado' in out))
})

test('lo guardado manda: no se pisa un declarado anterior', () => {
  const plan = planEscrituraVivienda({ usoDeclarado: 'habitual' }, { usoDeclarado: 'secundaria', regimenDeclarado: 'propietario' })
  assert.deepEqual(plan.escribir, { regimenDeclarado: 'propietario' })
})

test('misma dirección con huecos: se rellenan los huecos y lo guardado no se toca; otra dirección no se toca', () => {
  const plan = planEscrituraVivienda({ cp: '41003', municipio: 'SEVILLA' }, { cp: '41003', municipio: 'SEVILLA', nombreVia: 'EJEMPLO', numeroVia: '1' })
  assert.deepEqual(plan.escribir, { nombreVia: 'EJEMPLO', numeroVia: '1' })
  assert.deepEqual(plan.conflictos, [])
  const otra = planEscrituraVivienda({ cp: '41003', municipio: 'SEVILLA' }, { cp: '28001', nombreVia: 'EJEMPLO', numeroVia: '1' })
  assert.deepEqual(otra.escribir, {})
  assert.equal(otra.conflictos.length, 1)
})

test('precarga real de la póliza (texto + CP, sin nombreVia): solo se rellena si el texto CONTIENE la vía y el número declarados', () => {
  const precarga = { direccion: 'CL EJEMPLO 1, 2º B', cp: '41003' }
  const ok = planEscrituraVivienda(precarga, { cp: '41003', nombreVia: 'EJEMPLO', numeroVia: '1', municipio: 'SEVILLA' })
  assert.deepEqual(ok.escribir, { nombreVia: 'EJEMPLO', numeroVia: '1', municipio: 'SEVILLA' })
  const otraCalle = planEscrituraVivienda({ direccion: 'CL DISTINTA 7', cp: '41003' }, { cp: '41003', nombreVia: 'EJEMPLO', numeroVia: '1' })
  assert.deepEqual(otraCalle.escribir, {}, 'otra calle en el texto guardado: nada')
  assert.equal(otraCalle.conflictos.length, 1)
})

test('con OTRA referencia catastral no se mezcla la calle nueva con la referencia, m² y año viejos', () => {
  const guardada = { direccion: 'CL EJEMPLO 1', cp: '41003', referenciaCatastral: '1111111AA1111A0001AA', metrosCuadrados: 90, anioConstruccion: 1970 }
  const plan = planEscrituraVivienda(guardada, {
    cp: '41003', nombreVia: 'EJEMPLO', numeroVia: '1',
    referenciaCatastral: '2222222BB2222B0001BB', catastroReferencia: '2222222BB2222B0001BB', metrosCuadrados: 70, anioConstruccion: 2001,
  })
  assert.deepEqual(plan.escribir, {})
  assert.equal(plan.conflictos.length, 2, 'dirección y referencia, las dos como conflicto')
})
