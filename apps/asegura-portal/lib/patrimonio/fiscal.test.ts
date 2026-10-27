import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ResultadoRentabilidad, RentabilidadInmueble } from '@central/module-patrimonio'

import { AVISO_ORIENTATIVO, celdaCsv, csvFiscal, importeCsv, informeFiscal } from './fiscal.ts'

const inm = (p: Partial<RentabilidadInmueble> = {}): RentabilidadInmueble => ({
  inmuebleId: 'i1', ingresos: 1_200_000, gastos: 0, gastosPorCategoria: {}, seguros: 0, beneficio: 0, margenPct: null,
  gastosSinConfirmar: 0, avisos: [], ...p,
})
const res = (inmuebles: RentabilidadInmueble[], sinImputar = 0): ResultadoRentabilidad => ({ desde: '2025-01-01', hasta: '2025-12-31', inmuebles, sinImputar })
const META = [{ id: 'i1', alias: 'Piso Socorro', titular: 'Ana' }, { id: 'i2', alias: 'Local', titular: 'Ana' }]
const P = { anio: 2025, enCurso: false }

test('reclasifica por categoría: seguro (prima + factura), IBI, comunidad y reparaciones suman en deducibles', () => {
  const r = res([inm({
    gastosPorCategoria: { COMUNIDAD: 60_000, IMPUESTOS: 40_000, MANTENIMIENTO: 25_000, FINANCIACION: 300_000, REFORMAS: 500_000, OTRO: 1_000 },
    seguros: 30_000,
  })])
  const i = informeFiscal(r, META, P).arrendados[0]
  assert.equal(i.totalDeducibleCent, 60_000 + 40_000 + 25_000 + 30_000)
  assert.equal(i.aRevisarCent, 301_000) // financiación + otro: no se suman a lo deducible
  assert.equal(i.noDirectoCent, 500_000)
  assert.equal(i.lineas.find((l) => l.clave === 'SEGURO')?.importeCent, 30_000)
  assert.equal(i.rendimientoAntesAmortizacionCent, 1_200_000 - 155_000)
})

test('🚨 amortización sin dato: null, y el rendimiento neto es null (nunca 0 ni igual al de antes de amortizar)', () => {
  const sin = informeFiscal(res([inm({ gastosPorCategoria: { COMUNIDAD: 10_000 } })]), META, P).arrendados[0]
  assert.equal(sin.amortizacionCent, null)
  assert.equal(sin.rendimientoNetoCent, null)
  assert.equal(sin.rendimientoAntesAmortizacionCent, 1_190_000)
  for (const malo of [0, -5, Number.NaN, null]) {
    assert.equal(informeFiscal(res([inm()]), META, P, new Map([['i1', malo]])).arrendados[0].amortizacionCent, null, String(malo))
  }
  const con = informeFiscal(res([inm({ gastosPorCategoria: { COMUNIDAD: 10_000 } })]), META, P, new Map([['i1', 200_000]])).arrendados[0]
  assert.equal(con.amortizacionCent, 200_000)
  assert.equal(con.rendimientoNetoCent, 990_000)
})

test('inmueble sin ingresos en el año no entra (se nombra); avisos y facturas sin confirmar viajan al informe', () => {
  const r = res([inm({ avisos: ['prima_sin_dato'], gastosSinConfirmar: 2 }), inm({ inmuebleId: 'i2', ingresos: 0, avisos: ['sin_contrato'] })], 7_000)
  const inf = informeFiscal(r, META, P)
  assert.deepEqual(inf.arrendados.map((x) => x.alias), ['Piso Socorro'])
  assert.deepEqual(inf.sinIngresos, ['Local'])
  assert.deepEqual(inf.arrendados[0].avisos, ['prima_sin_dato'])
  assert.equal(inf.arrendados[0].gastosSinConfirmar, 2)
  assert.equal(inf.sinImputarCent, 7_000)
})

test('un inmueble que no está en la lista autorizada no se cuela', () => {
  assert.equal(informeFiscal(res([inm({ inmuebleId: 'ajeno' })]), META, P).arrendados.length, 0)
})

test('CSV: ; y BOM, coma decimal, «sin dato» en vez de 0, aviso orientativo y celdas a prueba de fórmulas', () => {
  assert.equal(importeCsv(123_456), '1234,56')
  assert.equal(importeCsv(null), '')
  assert.equal(celdaCsv('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(celdaCsv('a;b'), '"a;b"')
  assert.equal(celdaCsv('hola\nmundo'), 'hola mundo')
  const csv = csvFiscal(informeFiscal(res([inm({ gastosPorCategoria: { COMUNIDAD: 10_000 } })]), [{ id: 'i1', alias: '=SUMA(A1)', titular: 'Ana' }], P))
  assert.ok(csv.startsWith('﻿Año;Inmueble'))
  assert.match(csv, /Amortización estimada;;sin dato/)
  assert.match(csv, /Rendimiento neto;;sin dato/)
  assert.match(csv, /Ingresos íntegros \(renta devengada\);Ingreso;12000,00/)
  assert.ok(csv.includes(AVISO_ORIENTATIVO))
  assert.ok(csv.includes("'=SUMA(A1)"))
})

test('🚨 edificio sin división horizontal: sus unidades se agrupan bajo UNA referencia catastral con el total', () => {
  const meta = [
    { id: 'ed', alias: 'Busto Tavera 22', titular: 'Ana', edificioId: null, referenciaCatastral: '5731022TG3453B0001AK' },
    { id: 'p1', alias: 'Piso 1', titular: 'Ana', edificioId: 'ed', referenciaCatastral: null },
    { id: 'p2', alias: 'Piso 2', titular: 'Ana', edificioId: 'ed', referenciaCatastral: null },
    { id: 'p3', alias: 'Piso 3', titular: 'Ana', edificioId: 'ed', referenciaCatastral: null },
    { id: 'i1', alias: 'Piso Socorro', titular: 'Ana' },
  ]
  const r = res([
    inm({ inmuebleId: 'ed', ingresos: 0, gastos: 5_000, gastosPorCategoria: { COMUNIDAD: 5_000 } }), // sin repartir
    inm({ inmuebleId: 'p1', ingresos: 600_000, gastosPorCategoria: { IMPUESTOS: 60_000 }, seguros: 21_900 }),
    inm({ inmuebleId: 'p2', ingresos: 500_000, gastosPorCategoria: { IMPUESTOS: 40_000 }, seguros: 14_600 }),
    inm({ inmuebleId: 'p3', ingresos: 0 }),
    inm({ inmuebleId: 'i1', ingresos: 100_000 }),
  ])
  const inf = informeFiscal(r, meta, P)
  assert.deepEqual(inf.arrendados.map((i) => i.inmuebleId), ['i1'], 'las unidades NO salen sueltas')
  assert.deepEqual(inf.sinIngresos, [])
  assert.equal(inf.edificios.length, 1)
  const e = inf.edificios[0]
  assert.equal(e.referenciaCatastral, '5731022TG3453B0001AK')
  assert.deepEqual(e.unidades.map((u) => u.inmuebleId), ['p1', 'p2'])
  assert.deepEqual(e.unidadesSinIngresos, ['Piso 3'])
  assert.equal(e.comunes?.totalDeducibleCent, 5_000)
  assert.equal(e.ingresosCent, 1_100_000)
  assert.equal(e.totalDeducibleCent, 60_000 + 21_900 + 40_000 + 14_600 + 5_000)
  assert.equal(e.rendimientoAntesAmortizacionCent, 1_100_000 - e.totalDeducibleCent)
  assert.equal(e.rendimientoNetoCent, null)
  const csv = csvFiscal(inf)
  assert.match(csv, /Busto Tavera 22 · Piso 1/)
  assert.match(csv, /Busto Tavera 22 · Gastos comunes sin repartir/)
  assert.match(csv, /Ingresos íntegros del edificio;Total del edificio;11000,00;RC 5731022TG3453B0001AK/)
})

test('edificio sin unidades arrendadas ni renta propia: va a «sin ingresos», no a un grupo vacío', () => {
  const meta = [{ id: 'ed', alias: 'Edificio', titular: 'Ana', edificioId: null }, { id: 'p1', alias: 'Piso 1', titular: 'Ana', edificioId: 'ed' }]
  const inf = informeFiscal(res([inm({ inmuebleId: 'ed', ingresos: 0 }), inm({ inmuebleId: 'p1', ingresos: 0 })]), meta, P)
  assert.deepEqual(inf.edificios, [])
  assert.deepEqual(inf.sinIngresos, ['Edificio'])
})
