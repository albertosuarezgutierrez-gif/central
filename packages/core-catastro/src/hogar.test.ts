import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precalificarHogar } from './hogar.ts'
import type { DatosCatastro } from './parser.ts'

// Respuesta REAL de Consulta_DNPRC para 4632121TG3443B0015JW (02/09/2026).
const SAN_VICENTE: DatosCatastro = {
  direccion: 'CL SAN VICENTE 40 Es:1 Pl:02 Pt:14 41002 SEVILLA (SEVILLA)',
  superficie: 76, anioConstruccion: 1994, uso: 'Residencial', cuotaParticipacion: null,
  clase: 'UR', provincia: 'SEVILLA', municipio: 'SEVILLA', codigoPostal: '41002',
}

test('el caso real de Alberto: 76 m², 1994, Sevilla 41002, listo para cotizar', () => {
  const p = precalificarHogar(SAN_VICENTE)
  assert.equal(p.datos.metrosCuadrados, 76)
  assert.equal(p.datos.anioConstruccion, 1994)
  assert.equal(p.datos.codigoPostal, '41002')
  assert.equal(p.datos.direccion, 'CL SAN VICENTE 40 Es:1 Pl:02 Pt:14 41002 SEVILLA')
  assert.deepEqual(p.faltan, [])
  assert.deepEqual(p.avisos, [])
})

test('la superficie catastral se declara como supuesto (es la construida, no la útil)', () => {
  const p = precalificarHogar(SAN_VICENTE)
  const s = p.supuestos.find((x) => x.campo === 'metrosCuadrados')
  assert.ok(s)
  assert.equal(s?.optimista, false)
})

test('🚨 un local no se cotiza como vivienda sin avisar', () => {
  const p = precalificarHogar({ ...SAN_VICENTE, uso: 'Comercial' })
  assert.match(p.avisos.join(' '), /Comercial/)
})

test('🚨 la referencia de PARCELA no trae piso: se dice, no se inventa', () => {
  const p = precalificarHogar({ ...SAN_VICENTE, superficie: null, anioConstruccion: null })
  assert.equal(p.faltan.length, 2)
  assert.match(p.avisos.join(' '), /EDIFICIO/)
})

test('uso desconocido no se colapsa con «vivienda»', () => {
  const p = precalificarHogar({ ...SAN_VICENTE, uso: null })
  assert.match(p.avisos.join(' '), /no informa el uso/)
})
