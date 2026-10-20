import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datosViviendaVacios, inicialesHogarDeRiesgo } from './datos-vivienda-riesgo.ts'

test('la consulta propia al Catastro NO cambia lo que se siembra: a Codeoscopic va el total construido, nunca la vivienda sola', () => {
  const base = { ...datosViviendaVacios(), referenciaCatastral: '2053408VG1525S0001YW', metrosCuadrados: 228, anioConstruccion: 1980, cp: '23693' }
  const consultada = { ...base, catastroConsultadoAt: '2026-10-20T09:00:00.000Z', catastroReferencia: '2053408VG1525S0001YW', catastroMetrosVivienda: 143, catastroMetrosAnexos: 85 }
  assert.deepEqual(inicialesHogarDeRiesgo(consultada).correcciones, {}, 'con referencia sin confirmar manda el Catastro de asegura')
  const conf = inicialesHogarDeRiesgo({ ...consultada, confirmadoAt: '2026-10-20T10:00:00.000Z' }).correcciones
  assert.equal(conf.metrosCuadrados, 228)
  assert.equal(conf.catastroMetrosVivienda, undefined, 'el desglose no viaja')
})
