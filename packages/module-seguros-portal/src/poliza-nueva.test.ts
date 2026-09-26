import { test } from 'node:test'
import assert from 'node:assert/strict'
import { polizasNuevasParaAviso, type FilaPolizaNueva } from './poliza-nueva.ts'
import { avisosDe } from './avisos.ts'

const hoy = new Date('2026-10-05T10:00:00Z')
const base: FilaPolizaNueva = {
  numeroPoliza: '0801-0012345', codigoEntidadDgs: 'C0109', compania: 'Allianz', tipo: 'auto',
  fechaEfecto: '2026-09-29', creadaEn: new Date('2026-09-28T12:00:00Z'), sustituye: false, sustituyeA: null,
}

test('póliza creada tras el corte y dentro de 30 días → aviso con clave compañía+número', () => {
  const r = polizasNuevasParaAviso([base], hoy)
  assert.deepEqual(r.map((p) => p.id), ['C0109:08010012345'])
})

test('lo creado antes del corte o hace más de 30 días NO se avisa (no hay avalancha al activar)', () => {
  assert.deepEqual(polizasNuevasParaAviso([{ ...base, creadaEn: new Date('2026-09-20T00:00:00Z') }], hoy), [])
  assert.deepEqual(polizasNuevasParaAviso([{ ...base, creadaEn: new Date('2026-10-01T00:00:00Z') }], new Date('2026-11-15T00:00:00Z')), [])
})

test('sin número no se avisa; la emitida y la de CIMA (dos filas, mismo número) son UN aviso', () => {
  assert.deepEqual(polizasNuevasParaAviso([{ ...base, numeroPoliza: null }], hoy), [])
  assert.equal(polizasNuevasParaAviso([base, { ...base, numeroPoliza: '0801 0012345', creadaEn: new Date('2026-10-02T00:00:00Z') }], hoy).length, 1)
})

test('cambio de compañía: la campana lo dice y nombra la anterior', () => {
  const nuevas = polizasNuevasParaAviso([{ ...base, sustituye: true, sustituyeA: 'Mapfre' }], hoy)
  const { avisos } = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], polizasNuevas: nuevas, hoy })
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].tipo, 'poliza_emitida')
  assert.match(avisos[0].titulo, /póliza nueva/)
  assert.match(avisos[0].detalle, /Sustituye a tu póliza anterior de Mapfre, que se da de baja/)
  // Sin sustitución, no habla de baja.
  const sola = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], polizasNuevas: polizasNuevasParaAviso([base], hoy), hoy })
  assert.doesNotMatch(sola.avisos[0].detalle, /baja/)
})

test('fuente ilegible → globo con «+», nunca «sin avisos»', () => {
  const r = avisosDe({ autorizaciones: { otorgadas: [], recibidas: [] }, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], polizasNuevas: null, hoy })
  assert.deepEqual(r.fuentesIlegibles, ['polizas_nuevas'])
  assert.equal(r.globo, '0+')
})
