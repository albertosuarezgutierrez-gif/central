import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Contrato, ObligacionInmueble } from '@central/module-patrimonio'

import { avisosDePatrimonio, calendarioDeEntrada, resumenDeCalendario } from './calendario.ts'

const HOY = '2026-10-24'
const inmuebles = [{ id: 'i1', alias: 'Piso de Triana' }]
const ob = (x: Partial<ObligacionInmueble> = {}): ObligacionInmueble => ({
  id: 'o1', inmuebleId: 'i1', tipo: 'certificado_energetico', aplica: true, ultima: null, vence: '2026-11-10', periodicidadMeses: null, ...x,
})
const contrato = (x: Partial<Contrato> = {}): Contrato => ({
  id: 'c1', inmuebleId: 'i1', inquilinoIds: [], inicio: '2024-01-01', fin: '2026-10-01', terminadoEn: null, rentaMensual: 80_000,
  clausula: { tipo: 'ninguna' }, actualizaciones: [], fianza: null, seguroInquilino: null, ...x,
})

test('el calendario lleva el alias; lo de un inmueble que no está en la lista (otro titular) se descarta', () => {
  const vs = calendarioDeEntrada({ inmuebles, obligaciones: [ob(), ob({ id: 'o2', inmuebleId: 'ajeno' })], contratos: [] }, HOY)
  assert.deepEqual(vs.map((v) => [v.clave, v.inmueble]), [['o1:2026-11-10', 'Piso de Triana']])
})

test('avisos: lo que se acerca y lo vencido hace poco; sin fecha no; fin de contrato vencido no (prórroga LAU)', () => {
  const vs = calendarioDeEntrada(
    {
      inmuebles,
      obligaciones: [ob(), ob({ id: 'o2', vence: '2026-10-10' }), ob({ id: 'o3', vence: null, ultima: null, aplica: null }), ob({ id: 'o4', vence: '2027-06-01' })],
      contratos: [contrato()],
    },
    HOY,
  )
  const a = avisosDePatrimonio(vs)
  assert.deepEqual(a.map((x) => [x.clave, x.estado]).sort(), [['o1:2026-11-10', 'avisar'], ['o2:2026-10-10', 'vencida']])
  assert.ok(vs.some((v) => v.tipo === 'fin_contrato' && v.estado === 'vencida'), 'el fin de contrato SÍ está vencido en el calendario…')
  assert.ok(!a.some((x) => x.clave.startsWith('c1:fin')), '…pero no se avisa de él')
})

test('🚨 resumen: sin fecha es «sin fecha», no «al día»; al día no cuenta', () => {
  const vs = calendarioDeEntrada(
    { inmuebles, obligaciones: [ob(), ob({ id: 'o2', vence: '2026-10-10' }), ob({ id: 'o3', vence: null, aplica: null }), ob({ id: 'o4', vence: '2027-06-01' })], contratos: [] },
    HOY,
  )
  assert.deepEqual(resumenDeCalendario(vs), { vencidas: 1, porVencer: 1, sinFecha: 1 })
})

test('una obligación que no aplica no sale', () => {
  assert.deepEqual(calendarioDeEntrada({ inmuebles, obligaciones: [ob({ aplica: false })], contratos: [] }, HOY), [])
})
