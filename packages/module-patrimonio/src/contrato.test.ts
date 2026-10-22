// Contratos y actualización de renta: prorrateo por días, renta vigente, aniversarios, índice y tope legal.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { estadoContrato, finEfectivo, rentaDevengada, rentaVigente, totalRentaDevengada } from './contrato.ts'
import { aniversarioSiguiente, calcularActualizacionRenta, proximoAniversarioActualizacion } from './actualizacion-renta.ts'
import type { Contrato } from './tipos.ts'

const contrato = (p: Partial<Contrato> = {}): Contrato => ({
  id: 'c1', inmuebleId: 'i1', inquilinoIds: ['q1'], inicio: '2025-03-16', fin: '2030-03-15', terminadoEn: null,
  rentaMensual: 90_000, clausula: { tipo: 'indice', indice: 'IRAV' }, actualizaciones: [], fianza: null, seguroInquilino: null, ...p,
})

test('mes de entrada prorrateado por días; meses enteros completos', () => {
  const r = rentaDevengada(contrato(), '2025-03-01', '2025-05-31')
  assert.deepEqual(r.map((x) => [x.mes, x.importe, x.dias]), [
    ['2025-03', Math.round((90_000 * 16) / 31), 16],
    ['2025-04', 90_000, 30],
    ['2025-05', 90_000, 31],
  ])
})

test('actualización a mitad de mes: cada tramo con su renta', () => {
  const c = contrato({ actualizaciones: [{ desde: '2026-03-16', rentaMensual: 93_000 }] })
  assert.equal(rentaVigente(c, '2026-03-15'), 90_000)
  assert.equal(rentaVigente(c, '2026-03-16'), 93_000)
  const [marzo] = rentaDevengada(c, '2026-03-01', '2026-03-31')
  assert.equal(marzo.importe, Math.round((90_000 * 15 + 93_000 * 16) / 31))
})

test('terminado: la renta para el día de terminación; el fin pactado pasado SIN terminación no corta (prórroga LAU)', () => {
  const t = contrato({ terminadoEn: '2025-04-10' })
  assert.equal(totalRentaDevengada(t, '2025-04-01', '2025-12-31'), Math.round((90_000 * 10) / 30))
  const prorrogado = contrato({ inicio: '2020-01-01', fin: '2025-01-01' })
  assert.equal(totalRentaDevengada(prorrogado, '2025-06-01', '2025-06-30'), 90_000)
  assert.equal(estadoContrato(prorrogado, '2025-06-15'), 'vigente')
})

test('terminadoEn posterior al fin pactado (prórroga) manda sobre el fin', () => {
  const c = contrato({ inicio: '2020-01-01', fin: '2025-01-01', terminadoEn: '2026-06-30' })
  assert.equal(finEfectivo(c), '2026-06-30')
  assert.equal(estadoContrato(c, '2026-06-30'), 'vigente')
  assert.equal(estadoContrato(c, '2026-07-01'), 'terminado')
  assert.equal(estadoContrato(contrato(), '2025-03-15'), 'futuro')
})

test('aniversarios: el siguiente a la última actualización; 29/02 cae el 28/02', () => {
  assert.equal(aniversarioSiguiente('2025-03-16', '2025-03-16'), '2026-03-16')
  assert.equal(aniversarioSiguiente('2024-02-29', '2024-02-29'), '2025-02-28')
  const c = contrato({ actualizaciones: [{ desde: '2026-03-16', rentaMensual: 93_000 }] })
  assert.equal(proximoAniversarioActualizacion(c), '2027-03-16')
})

const ipcIrav = { indice: 'IRAV' as const, pct: 2.95, periodo: '2026-01' }

test('propuesta en el aniversario con el índice del contrato, en puntos básicos enteros', () => {
  const r = calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-03-01', variacion: ipcIrav })
  assert.equal(r.estado, 'propuesta')
  if (r.estado === 'propuesta') {
    assert.equal(r.aplicableDesde, '2026-03-16')
    assert.equal(r.rentaActual, 90_000)
    assert.equal(r.rentaNueva, 92_655) // 900 € × 1,0295
    assert.equal(r.pctAplicado, 2.95)
    assert.equal(r.topado, false)
  }
})

test('tope legal: la subida se recorta y se dice; una variación negativa baja la renta', () => {
  const t = calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-03-16', variacion: { ...ipcIrav, pct: 5.4 }, topePct: 3 })
  assert.ok(t.estado === 'propuesta' && t.rentaNueva === 92_700 && t.topado && t.pctAplicado === 3)
  const n = calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-03-16', variacion: { ...ipcIrav, pct: -0.5 }, topePct: 3 })
  assert.ok(n.estado === 'propuesta' && n.rentaNueva === 89_550 && !n.topado)
})

test('sin cláusula no se actualiza; antes de la antelación no toca; sin índice no se inventa 0 %', () => {
  assert.deepEqual(calcularActualizacionRenta({ contrato: contrato({ clausula: { tipo: 'ninguna' } }), hoy: '2026-03-16', variacion: ipcIrav }), { estado: 'sin_clausula' })
  assert.deepEqual(calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-01-10', variacion: ipcIrav }), { estado: 'no_toca', proximoAniversario: '2026-03-16' })
  assert.deepEqual(calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-03-16', variacion: null }), { estado: 'sin_indice', proximoAniversario: '2026-03-16' })
})

test('el índice tiene que ser el del contrato: un IPC no actualiza un contrato IRAV', () => {
  const r = calcularActualizacionRenta({ contrato: contrato(), hoy: '2026-03-16', variacion: { ...ipcIrav, indice: 'IPC' } })
  assert.equal(r.estado, 'indice_distinto')
})

test('contrato terminado antes del aniversario no se actualiza', () => {
  const r = calcularActualizacionRenta({ contrato: contrato({ terminadoEn: '2026-03-01' }), hoy: '2026-02-20', variacion: ipcIrav })
  assert.deepEqual(r, { estado: 'terminado' })
})
