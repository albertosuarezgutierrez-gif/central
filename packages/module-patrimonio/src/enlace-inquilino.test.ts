// Enlace del inquilino: solo `vigente` enseña algo, y lo que enseña es la lista blanca.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CAMPOS_VISTA_INQUILINO,
  DIAS_ENLACE_TRAS_TERMINAR,
  estadoEnlace,
  vistaDelEnlace,
  type EnlaceInquilino,
} from './enlace-inquilino.ts'
import { sumarDias } from './fechas.ts'
import type { Contrato } from './tipos.ts'

const HOY = '2026-10-22'

const contrato = (p: Partial<Contrato> = {}): Contrato => ({
  id: 'k1', inmuebleId: 'i1', inquilinoIds: ['q1', 'q2'], inicio: '2025-01-01', fin: '2026-01-01', terminadoEn: null,
  rentaMensual: 95_000, clausula: { tipo: 'indice', indice: 'IRAV' },
  actualizaciones: [{ desde: '2026-01-01', rentaMensual: 98_000 }],
  fianza: { importe: 95_000, depositadaEn: '2025-01-20', devueltaEn: null },
  seguroInquilino: { exigido: true, venceRecibo: '2026-12-31' }, ...p,
})
const enlace = (p: Partial<EnlaceInquilino> = {}): EnlaceInquilino => ({ contratoId: 'k1', inquilinoId: 'q1', anuladoEn: null, ...p })
const inmueble = { id: 'i1', alias: 'Piso del moroso', direccion: 'Calle Socorro 24, 41003 Sevilla' }

test('vigente aunque haya pasado el fin PACTADO (prórroga LAU)', () => {
  assert.equal(estadoEnlace(enlace(), contrato(), HOY), 'vigente')
})

test('anulado gana a todo', () => {
  assert.equal(estadoEnlace(enlace({ anuladoEn: new Date('2026-10-01T00:00:00Z') }), contrato({ terminadoEn: '2020-01-01' }), HOY), 'anulado')
})

test('enlace de otro contrato o de un inquilino que ya no está → no_corresponde', () => {
  assert.equal(estadoEnlace(enlace({ contratoId: 'k2' }), contrato(), HOY), 'no_corresponde')
  assert.equal(estadoEnlace(enlace({ inquilinoId: 'q9' }), contrato(), HOY), 'no_corresponde')
})

test('terminado: abierto hasta el margen inclusive, caducado al día siguiente', () => {
  const t = sumarDias(HOY, -DIAS_ENLACE_TRAS_TERMINAR)
  assert.equal(estadoEnlace(enlace(), contrato({ terminadoEn: t }), HOY), 'vigente')
  assert.equal(estadoEnlace(enlace(), contrato({ terminadoEn: sumarDias(t, -1) }), HOY), 'caducado')
})

test('fechas ilegibles o margen inválido → caducado (no se abre a ciegas)', () => {
  assert.equal(estadoEnlace(enlace(), contrato({ terminadoEn: '2026-02-30' }), HOY), 'caducado')
  assert.equal(estadoEnlace(enlace(), contrato(), 'ayer'), 'caducado')
  assert.equal(estadoEnlace(enlace(), contrato({ terminadoEn: HOY }), HOY, -1), 'caducado')
  assert.equal(estadoEnlace(enlace(), contrato({ terminadoEn: HOY }), HOY, Number.NaN), 'caducado')
})

test('la vista tiene EXACTAMENTE los campos de la lista blanca', () => {
  const r = vistaDelEnlace(enlace(), contrato(), inmueble, HOY)
  assert.equal(r.estado, 'vigente')
  if (r.estado !== 'vigente') return
  assert.deepEqual(Object.keys(r.vista).sort(), [...CAMPOS_VISTA_INQUILINO].sort())
  assert.deepEqual(Object.keys(r.vista.seguro ?? {}).sort(), ['exigido', 'venceRecibo'])
  assert.deepEqual(r.vista, {
    inmueble: 'Calle Socorro 24, 41003 Sevilla', inicio: '2025-01-01', fin: '2026-01-01', terminadoEn: null,
    seguro: { exigido: true, venceRecibo: '2026-12-31' },
  })
})

test('no se filtra renta, fianza, otros inquilinos ni el alias cuando hay dirección', () => {
  const r = vistaDelEnlace(enlace(), contrato(), inmueble, HOY)
  const txt = JSON.stringify(r)
  for (const prohibido of ['95000', '98000', 'q2', 'q1', 'moroso', 'IRAV', '2025-01-20', 'k1', 'i1']) {
    assert.ok(!txt.includes(prohibido), prohibido)
  }
})

test('sin dirección se usa el alias; sin ninguno → null (no se inventa)', () => {
  const a = vistaDelEnlace(enlace(), contrato(), { ...inmueble, direccion: null }, HOY)
  assert.equal(a.estado === 'vigente' && a.vista.inmueble, 'Piso del moroso')
  const n = vistaDelEnlace(enlace(), contrato(), { ...inmueble, direccion: '  ', alias: '' }, HOY)
  assert.equal(n.estado === 'vigente' && n.vista.inmueble, null)
})

test('seguro no consta → null, no «no exigido»', () => {
  const r = vistaDelEnlace(enlace(), contrato({ seguroInquilino: null }), inmueble, HOY)
  assert.equal(r.estado === 'vigente' && r.vista.seguro, null)
})

test('fuera de vigente no hay vista; inmueble de otro contrato → no_corresponde', () => {
  assert.deepEqual(vistaDelEnlace(enlace({ anuladoEn: new Date() }), contrato(), inmueble, HOY), { estado: 'anulado' })
  assert.deepEqual(vistaDelEnlace(enlace(), contrato(), { ...inmueble, id: 'i2' }, HOY), { estado: 'no_corresponde' })
})
