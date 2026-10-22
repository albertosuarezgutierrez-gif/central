// Calendario de obligaciones: `hoy` SIEMPRE inyectado y relativo a las fechas del caso (nunca el reloj real).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calendarioPatrimonio, estadoPorFecha, vencimientoDeObligacion, vencimientosDeContrato, type ObligacionInmueble } from './calendario.ts'
import { sumarDias } from './fechas.ts'
import type { Contrato } from './tipos.ts'

const HOY = '2026-10-22'

const obligacion = (p: Partial<ObligacionInmueble> = {}): ObligacionInmueble => ({
  id: 'o1', inmuebleId: 'i1', tipo: 'certificado_energetico', aplica: true, ultima: null, vence: null, periodicidadMeses: null, ...p,
})

const contrato = (p: Partial<Contrato> = {}): Contrato => ({
  id: 'c1', inmuebleId: 'i1', inquilinoIds: ['q1'], inicio: sumarDias(HOY, -400), fin: sumarDias(HOY, 100), terminadoEn: null,
  rentaMensual: 90_000, clausula: { tipo: 'ninguna' }, actualizaciones: [], fianza: null, seguroInquilino: null, ...p,
})

test('estadoPorFecha: vencida / avisar / al día / sin dato', () => {
  assert.equal(estadoPorFecha('2026-10-21', '2026-09-01', HOY), 'vencida')
  assert.equal(estadoPorFecha('2026-10-22', '2026-09-01', HOY), 'avisar')
  assert.equal(estadoPorFecha('2027-10-22', '2027-09-01', HOY), 'al_dia')
  assert.equal(estadoPorFecha(null, null, HOY), 'sin_dato')
})

test('certificado energético: última + 10 años del catálogo', () => {
  const v = vencimientoDeObligacion(obligacion({ ultima: '2017-01-15' }), HOY)
  assert.equal(v?.vence, '2027-01-15')
  assert.equal(v?.estado, 'avisar') // a 85 días, el catálogo avisa desde 90
  assert.equal(v?.dias, 85)
})

test('periodicidad propia manda sobre el catálogo (certificado G = 5 años)', () => {
  const v = vencimientoDeObligacion(obligacion({ ultima: '2020-01-15', periodicidadMeses: 60 }), HOY)
  assert.equal(v?.vence, '2025-01-15')
  assert.equal(v?.estado, 'vencida')
})

test('ITE sin periodicidad en catálogo y sin fecha → sin_dato con lo que falta, nunca al día', () => {
  const v = vencimientoDeObligacion(obligacion({ tipo: 'ite_iee', ultima: '2015-05-01' }), HOY)
  assert.equal(v?.estado, 'sin_dato')
  assert.match(v?.falta ?? '', /cada cuánto/)
  const w = vencimientoDeObligacion(obligacion({ tipo: 'ite_iee', aplica: null }), HOY)
  assert.equal(w?.estado, 'sin_dato')
  assert.match(w?.falta ?? '', /si este inmueble/)
})

test('aplica=false no sale; vence explícito manda', () => {
  assert.equal(vencimientoDeObligacion(obligacion({ aplica: false, ultima: '2017-01-15' }), HOY), null)
  const v = vencimientoDeObligacion(obligacion({ tipo: 'inspeccion_ascensor', vence: sumarDias(HOY, 30) }), HOY)
  assert.equal(v?.estado, 'avisar')
})

test('fin de contrato a 100 días → avisar (preaviso LAU); sin fecha de fin → sin_dato', () => {
  const vs = vencimientosDeContrato(contrato(), HOY)
  const fin = vs.find((v) => v.tipo === 'fin_contrato')
  assert.equal(fin?.estado, 'avisar')
  const sinFin = vencimientosDeContrato(contrato({ fin: null }), HOY).find((v) => v.tipo === 'fin_contrato')
  assert.equal(sinFin?.estado, 'sin_dato')
})

test('fianza: sin depositar a los 30 días → vencida; depositada → cumplida', () => {
  const noDep = vencimientosDeContrato(contrato({ fianza: { importe: 90_000, depositadaEn: null, devueltaEn: null } }), HOY)
  assert.equal(noDep.find((v) => v.tipo === 'deposito_fianza')?.estado, 'vencida')
  const dep = vencimientosDeContrato(contrato({ fianza: { importe: 90_000, depositadaEn: sumarDias(HOY, -390), devueltaEn: null } }), HOY)
  assert.equal(dep.find((v) => v.tipo === 'deposito_fianza')?.estado, 'cumplida')
})

test('plazo de depósito de la fianza parametrizable por comunidad autónoma', () => {
  const c = contrato({ inicio: sumarDias(HOY, -20), fianza: { importe: 1, depositadaEn: null, devueltaEn: null } })
  assert.equal(vencimientosDeContrato(c, HOY).find((v) => v.tipo === 'deposito_fianza')?.estado, 'avisar')
  assert.equal(vencimientosDeContrato(c, HOY, { plazoDepositoFianzaDias: 60 }).find((v) => v.tipo === 'deposito_fianza')?.estado, 'al_dia')
})

test('contrato terminado: devolución de fianza a 1 mes; ya no avisa de fin ni de seguro', () => {
  const c = contrato({
    terminadoEn: sumarDias(HOY, -20),
    fianza: { importe: 90_000, depositadaEn: sumarDias(HOY, -390), devueltaEn: null },
    seguroInquilino: { exigido: true, venceRecibo: null },
  })
  const vs = vencimientosDeContrato(c, HOY)
  assert.equal(vs.find((v) => v.tipo === 'devolucion_fianza')?.estado, 'avisar')
  assert.equal(vs.find((v) => v.tipo === 'fin_contrato'), undefined)
  assert.equal(vs.find((v) => v.tipo === 'seguro_inquilino'), undefined)
})

test('seguro del inquilino exigido sin recibo → sin_dato «no ha aportado el recibo»', () => {
  const vs = vencimientosDeContrato(contrato({ seguroInquilino: { exigido: true, venceRecibo: null } }), HOY)
  const s = vs.find((v) => v.tipo === 'seguro_inquilino')
  assert.equal(s?.estado, 'sin_dato')
  assert.match(s?.falta ?? '', /recibo/)
})

test('actualización de renta: obligación en el próximo aniversario si hay cláusula', () => {
  const c = contrato({ inicio: sumarDias(HOY, -350), clausula: { tipo: 'indice', indice: 'IPC' } })
  const a = vencimientosDeContrato(c, HOY).find((v) => v.tipo === 'actualizacion_renta')
  assert.equal(a?.estado, 'avisar')
  assert.equal(vencimientosDeContrato(contrato(), HOY).find((v) => v.tipo === 'actualizacion_renta'), undefined)
})

test('calendario ordenado: vencidas → avisar → sin dato → al día → cumplidas', () => {
  const vs = calendarioPatrimonio({
    obligaciones: [
      obligacion({ id: 'a', ultima: '2018-12-01' }), // vence 2028 → al día
      obligacion({ id: 'b', tipo: 'ite_iee' }), // sin dato
      obligacion({ id: 'c', tipo: 'revision_gas', ultima: '2021-01-01' }), // vencida
    ],
    contratos: [contrato({ fianza: { importe: 1, depositadaEn: '2025-10-01', devueltaEn: null } })],
  }, HOY)
  assert.deepEqual(vs.map((v) => v.estado), ['vencida', 'avisar', 'sin_dato', 'al_dia', 'cumplida'])
})
