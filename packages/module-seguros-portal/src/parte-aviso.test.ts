import assert from 'node:assert/strict'
import { test } from 'node:test'

import { avisosDe } from './avisos.ts'
import { DIAS_AVISO_PARTE, partesParaAviso, type ParteFilaAviso } from './parte-aviso.ts'

const HOY = new Date('2026-09-26T12:00:00Z')
const dias = (n: number) => new Date(HOY.getTime() - n * 86_400_000)
const fila = (x: Partial<ParteFilaAviso>): ParteFilaAviso => ({
  id: 'p1',
  fechaHecho: new Date('2026-09-20T00:00:00Z'),
  abiertoEnCompaniaAt: null,
  descartadoAt: null,
  motivoDescarte: null,
  compania: 'Mapfre',
  ...x,
})

test('abierto hace poco → aviso; fuera de la ventana → nada', () => {
  assert.equal(partesParaAviso([fila({ abiertoEnCompaniaAt: dias(1) })], HOY)[0]?.cambio, 'abierto')
  assert.deepEqual(partesParaAviso([fila({ abiertoEnCompaniaAt: dias(DIAS_AVISO_PARTE + 1) })], HOY), [])
})

test('sin fecha de cambio no se avisa: un estado sin su fecha no dice cuándo pasó', () => {
  assert.deepEqual(partesParaAviso([fila({})], HOY), [])
})

test('descartado gana a abierto: lo último es lo que vale', () => {
  const r = partesParaAviso([fila({ abiertoEnCompaniaAt: dias(3), descartadoAt: dias(1), motivoDescarte: 'no cubierto' })], HOY)
  assert.equal(r[0]?.cambio, 'descartado')
  assert.equal(r[0]?.motivoDescarte, 'no cubierto')
})

test('en la campana: título con la compañía, y `null` es fuente ilegible, no «nada»', () => {
  const base = { autorizaciones: null, obligaciones: [], peticiones: [], datos: [], carnets: [], firmas: [], hoy: HOY }
  const r = avisosDe({ ...base, autorizaciones: { otorgadas: [], recibidas: [] }, partes: partesParaAviso([fila({ abiertoEnCompaniaAt: dias(1) })], HOY) })
  const a = r.avisos.find((x) => x.tipo === 'parte_actualizado')
  assert.match(a?.titulo ?? '', /ya está abierto con Mapfre/)
  assert.equal(a?.href, '/boveda?vista=siniestro')
  assert.ok(avisosDe({ ...base, autorizaciones: { otorgadas: [], recibidas: [] }, partes: null }).fuentesIlegibles.includes('partes'))
})
