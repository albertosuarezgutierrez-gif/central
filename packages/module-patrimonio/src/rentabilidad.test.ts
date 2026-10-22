// Rentabilidad por inmueble: renta devengada − gastos confirmados − seguros, con los tres estados del dato.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { primaProrrateada, rentabilidadPorInmueble, type EntradaRentabilidad } from './rentabilidad.ts'
import type { Contrato, Gasto, Inmueble, Titular } from './tipos.ts'

const titular = (p: Partial<Titular> = {}): Titular => ({ id: 't1', tipo: 'persona', nombre: 'A', nif: null, deduceIva: false, ...p })
const inmueble = (id: string, p: Partial<Inmueble> = {}): Inmueble => ({
  id, titularId: 't1', alias: id, uso: 'vivienda', referenciaCatastral: null, suministros: [], cp: null,
  direccion: null, superficieM2: null, anioConstruccion: null, enComunidad: null, ...p,
})
const contrato = (p: Partial<Contrato> = {}): Contrato => ({
  id: 'c1', inmuebleId: 'i1', inquilinoIds: [], inicio: '2025-01-01', fin: null, terminadoEn: null,
  rentaMensual: 100_000, clausula: { tipo: 'ninguna' }, actualizaciones: [], fianza: null, seguroInquilino: null, ...p,
})
let n = 0
const gasto = (p: Partial<Gasto> = {}): Gasto => ({
  id: `g${++n}`, titularId: 't1', inmuebleId: 'i1', fecha: '2026-02-10', categoria: 'COMUNIDAD', concepto: null,
  base: 10_000, total: 12_100, estado: 'confirmado', origen: 'manual', clave: null, ...p,
})

const base = (p: Partial<EntradaRentabilidad> = {}): EntradaRentabilidad => ({
  titulares: [titular()], inmuebles: [inmueble('i1')], contratos: [contrato()], gastos: [],
  primas: [{ inmuebleId: 'i1', primaAnual: 36_500, desde: '2026-01-01', hasta: '2027-01-01' }],
  desde: '2026-01-01', hasta: '2026-03-31', ...p,
})

test('vivienda (no deduce IVA): renta − gastos con IVA − prima prorrateada', () => {
  const r = rentabilidadPorInmueble(base({ gastos: [gasto()] }))
  const i = r.inmuebles[0]
  assert.equal(i.ingresos, 300_000)
  assert.equal(i.gastos, 12_100) // el IVA soportado es coste en la vivienda
  assert.equal(i.seguros, 9_000) // 365 €/año × 90 días / 365
  assert.equal(i.beneficio, 300_000 - 12_100 - 9_000)
  assert.equal(i.margenPct, Math.round(((300_000 - 21_100) / 300_000) * 1000) / 10)
  assert.deepEqual(i.avisos, [])
})

test('titular que deduce IVA (local): cuenta la BASE', () => {
  const r = rentabilidadPorInmueble(base({ titulares: [titular({ deduceIva: true })], gastos: [gasto()] }))
  assert.equal(r.inmuebles[0].gastos, 10_000)
})

test('deduceIva desconocido → total (conservador) y lo dice', () => {
  const r = rentabilidadPorInmueble(base({ titulares: [titular({ deduceIva: null })], gastos: [gasto()] }))
  assert.equal(r.inmuebles[0].gastos, 12_100)
  assert.ok(r.inmuebles[0].avisos.includes('iva_sin_dato'))
})

test('propuestos por la IA no cuentan, se cuentan aparte; descartados ni eso', () => {
  const r = rentabilidadPorInmueble(base({ gastos: [gasto({ estado: 'propuesto' }), gasto({ estado: 'propuesto' }), gasto({ estado: 'descartado' })] }))
  assert.equal(r.inmuebles[0].gastos, 0)
  assert.equal(r.inmuebles[0].gastosSinConfirmar, 2)
})

test('gasto sin el importe que toca: no cuenta como 0, avisa', () => {
  const r = rentabilidadPorInmueble(base({ gastos: [gasto({ total: null })] }))
  assert.equal(r.inmuebles[0].gastos, 0)
  assert.ok(r.inmuebles[0].avisos.includes('gasto_sin_importe'))
})

test('pólizas sin leer (null) ≠ sin seguro: avisos distintos', () => {
  const sinLeer = rentabilidadPorInmueble(base({ primas: null }))
  assert.equal(sinLeer.inmuebles[0].seguros, 0)
  assert.deepEqual(sinLeer.inmuebles[0].avisos, ['seguros_sin_leer'])
  const sinSeguro = rentabilidadPorInmueble(base({ primas: [] }))
  assert.deepEqual(sinSeguro.inmuebles[0].avisos, ['sin_seguro_conocido'])
})

test('prima desconocida de una póliza que existe → prima_sin_dato, no «sin seguro»', () => {
  const r = rentabilidadPorInmueble(base({ primas: [{ inmuebleId: 'i1', primaAnual: null, desde: '2026-01-01', hasta: '2027-01-01' }] }))
  assert.deepEqual(r.inmuebles[0].avisos, ['prima_sin_dato'])
})

test('factura de seguro + prima de cartera → posible doble seguro', () => {
  const r = rentabilidadPorInmueble(base({ gastos: [gasto({ categoria: 'SEGURO', base: 20_000, total: 20_000 })] }))
  assert.equal(r.inmuebles[0].seguros, 29_000)
  assert.equal(r.inmuebles[0].gastos, 0)
  assert.ok(r.inmuebles[0].avisos.includes('posible_doble_seguro'))
})

test('gasto del titular sin inmueble va a sinImputar; inmueble sin contrato avisa y margen null', () => {
  const r = rentabilidadPorInmueble(base({
    inmuebles: [inmueble('i1'), inmueble('i2')],
    gastos: [gasto({ inmuebleId: null, categoria: 'GESTION', total: 5_000 })],
    primas: [],
  }))
  assert.equal(r.sinImputar, 5_000)
  const i2 = r.inmuebles.find((x) => x.inmuebleId === 'i2')!
  assert.equal(i2.ingresos, 0)
  assert.equal(i2.margenPct, null)
  assert.ok(i2.avisos.includes('sin_contrato'))
})

test('gastos fuera del periodo o de un inmueble ajeno a la lista no entran', () => {
  const r = rentabilidadPorInmueble(base({ gastos: [gasto({ fecha: '2025-12-31' }), gasto({ inmuebleId: 'ix' })] }))
  assert.equal(r.inmuebles[0].gastos, 0)
})

test('primaProrrateada: fuera de la anualidad 0, prima null → null', () => {
  const p = { inmuebleId: 'i1', primaAnual: 36_500, desde: '2026-01-01', hasta: '2027-01-01' }
  assert.equal(primaProrrateada(p, '2025-01-01', '2025-12-31'), 0)
  assert.equal(primaProrrateada(p, '2026-01-01', '2026-12-31'), 36_500)
  assert.equal(primaProrrateada({ ...p, primaAnual: null }, '2026-01-01', '2026-01-31'), null)
})
