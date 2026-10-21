// Qué vehículos alimentan el aviso de ITV de la campana (21/10/2026). Fechas fijas SOLO como datos de entrada
// con `hoy` inyectado (nada contra el reloj).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { vehiculosParaAviso } from './vehiculos-aviso-reglas.ts'

const HOY = '2026-10-21'
const propia = (x: Partial<Parameters<typeof vehiculosParaAviso>[0]['propias'][number]> = {}) => ({
  id: 'p1',
  ramo: 'auto',
  enVigor: true,
  bien: { cosa: 'Seat Ibiza · 1234BCD', matricula: '1234BCD', fechaMatriculacion: '2022-11-05' },
  ...x,
})
const declarada = (x: Partial<Parameters<typeof vehiculosParaAviso>[0]['declaradas'][number]> = {}) => ({
  id: 'd1',
  ramo: 'auto',
  matricula: '5678KLM',
  fechaMatriculacion: '2022-11-05',
  fechaVencimiento: null,
  ...x,
})
const entrada = (x: Partial<Parameters<typeof vehiculosParaAviso>[0]> = {}) => ({ propias: [], declaradas: [], recordatorios: [], hoy: HOY, ...x })

test('propias en vigor y declaradas entran con el mismo id que el selector (`cartera:`/`declarada:`)', () => {
  const r = vehiculosParaAviso(entrada({ propias: [propia()], declaradas: [declarada()] }))
  assert.deepEqual(r.map((v) => v.id), ['cartera:p1', 'declarada:d1'])
  assert.equal(r[0]!.fechaMatriculacion, '2022-11-05')
  assert.equal(r[1]!.cosa, null)
})

test('una póliza que ya no está en vigor, o una declarada con el vencimiento pasado, no avisa (vendió el coche)', () => {
  const r = vehiculosParaAviso(entrada({ propias: [propia({ enVigor: false })], declaradas: [declarada({ fechaVencimiento: '2026-10-20' })] }))
  assert.deepEqual(r, [])
  // Vence hoy o no se sabe cuándo (null): SÍ entra (esconder lo que no se sabe sería decidir por la persona).
  assert.equal(vehiculosParaAviso(entrada({ declaradas: [declarada({ fechaVencimiento: HOY })] })).length, 1)
  assert.equal(vehiculosParaAviso(entrada({ declaradas: [declarada({ fechaVencimiento: null })] })).length, 1)
})

test('la matriculación que no consta pasa como null (el aviso la descarta), nunca como una fecha de relleno', () => {
  const r = vehiculosParaAviso(entrada({ propias: [propia({ bien: { cosa: null, matricula: '1234BCD' } })] }))
  assert.equal(r[0]!.fechaMatriculacion, null)
})

test('🚨 un recordatorio propio de ITV para el coche lo saca (no se duplica); el de otro coche no', () => {
  const rec = { tipo: 'itv', polizaId: 'p1', polizaDeclaradaId: null, titulo: 'ITV' }
  const r = vehiculosParaAviso(entrada({ propias: [propia(), propia({ id: 'p2', bien: { cosa: null, matricula: '9999ZZZ', fechaMatriculacion: '2022-11-05' } })], declaradas: [declarada()], recordatorios: [rec] }))
  assert.deepEqual(r.map((v) => v.id), ['cartera:p2', 'declarada:d1'])
})
