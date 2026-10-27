import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { RentabilidadInmueble, ResultadoRentabilidad } from '@central/module-patrimonio'

import { informeFiscal } from './fiscal.ts'
import { TEXTO_LEGAL_GESTOR, TITULAR_SIN_IDENTIFICAR, csvGestor, informeGestor } from './informe-gestor.ts'

const inm = (p: Partial<RentabilidadInmueble> = {}): RentabilidadInmueble => ({
  inmuebleId: 'i1', ingresos: 1_200_000, gastos: 0, gastosPorCategoria: {}, seguros: 0, beneficio: 0, margenPct: null,
  gastosSinConfirmar: 0, avisos: [], ...p,
})
const res = (inmuebles: RentabilidadInmueble[], sinImputar = 0): ResultadoRentabilidad => ({ desde: '2025-01-01', hasta: '2025-12-31', inmuebles, sinImputar })
const P = { anio: 2025, enCurso: false }
const META = [
  { id: 'i1', alias: 'Piso Socorro', titular: 'Ana' },
  { id: 'i2', alias: 'Local', titular: 'Ana' },
  { id: 'i3', alias: 'Ático', titular: 'Ana' },
]
const fiscal = () =>
  informeFiscal(res([
    inm({ inmuebleId: 'i1', ingresos: 1_000_000, gastosPorCategoria: { IMPUESTOS: 100_000 } }),
    inm({ inmuebleId: 'i2', ingresos: 500_000, gastosPorCategoria: { COMUNIDAD: 50_000 } }),
    inm({ inmuebleId: 'i3', ingresos: 0 }),
  ], 7_000), META, P)

test('agrupa por IDENTIDAD, no por nombre: dos titulares llamados igual no se funden', () => {
  const g = informeGestor(fiscal(), new Map([['i1', { id: 'A', nombre: 'Ana' }], ['i2', { id: 'B', nombre: 'Ana' }]]))
  assert.equal(g.titulares.length, 2)
  assert.deepEqual(g.titulares.map((t) => t.titularId).sort(), ['A', 'B'])
  assert.equal(g.titulares.find((t) => t.titularId === 'A')!.totales.ingresosCent, 1_000_000)
})

test('totales del titular = suma de lo que ya calcula informeFiscal; neto null si falta una amortización (jamás 0)', () => {
  const g = informeGestor(fiscal(), new Map([['i1', { id: 'A', nombre: 'Ana' }], ['i2', { id: 'A', nombre: 'Ana' }]]))
  const t = g.titulares[0]
  assert.equal(t.totales.ingresosCent, 1_500_000)
  assert.equal(t.totales.totalDeducibleCent, 150_000)
  assert.equal(t.totales.rendimientoAntesAmortizacionCent, 1_350_000)
  assert.equal(t.totales.rendimientoNetoCent, null)
  assert.deepEqual(g.sinIngresos, ['Ático'])
  assert.equal(g.sinImputarCent, 7_000)
})

test('con amortización de todos los inmuebles hay neto; con uno solo sin dato, no', () => {
  const am = new Map<string, number | null>([['i1', 200_000], ['i2', 100_000]])
  const inf = informeFiscal(res([inm({ inmuebleId: 'i1' }), inm({ inmuebleId: 'i2' })]), META, P, am)
  const titularDe = new Map([['i1', { id: 'A', nombre: 'Ana' }], ['i2', { id: 'A', nombre: 'Ana' }]])
  assert.equal(informeGestor(inf, titularDe).titulares[0].totales.rendimientoNetoCent, 2_400_000 - 300_000)
  const inf2 = informeFiscal(res([inm({ inmuebleId: 'i1' }), inm({ inmuebleId: 'i2' })]), META, P, new Map([['i1', 200_000]]))
  assert.equal(informeGestor(inf2, titularDe).titulares[0].totales.rendimientoNetoCent, null)
})

test('inmueble sin titular conocido va a su propio grupo, no a otro titular', () => {
  const g = informeGestor(fiscal(), new Map([['i1', { id: 'A', nombre: 'Ana' }]]))
  assert.deepEqual(g.titulares.map((t) => t.titularId).sort(), ['A', TITULAR_SIN_IDENTIFICAR].sort())
})

test('soloTitular deja únicamente a ese titular; uno inexistente deja la lista vacía (no la de otro)', () => {
  const t = new Map([['i1', { id: 'A', nombre: 'Ana' }], ['i2', { id: 'B', nombre: 'Berta' }]])
  assert.deepEqual(informeGestor(fiscal(), t, 'B').titulares.map((x) => x.titularId), ['B'])
  assert.deepEqual(informeGestor(fiscal(), t, 'ZZZ').titulares, [])
})

test('edificio: sale por unidad en el CSV, con total del edificio y total del titular', () => {
  const meta = [
    { id: 'ed', alias: 'Busto Tavera 22', titular: 'María', referenciaCatastral: 'RC1' },
    { id: 'u1', alias: '1ºA', titular: 'María', edificioId: 'ed', referenciaCatastral: 'RC1' },
    { id: 'u2', alias: '1ºB', titular: 'María', edificioId: 'ed', referenciaCatastral: 'RC1' },
  ]
  const inf = informeFiscal(res([inm({ inmuebleId: 'ed', ingresos: 0 }), inm({ inmuebleId: 'u1', ingresos: 600_000 }), inm({ inmuebleId: 'u2', ingresos: 0 })]), meta, P)
  const g = informeGestor(inf, new Map(meta.map((m) => [m.id, { id: 'M', nombre: 'María' }])))
  const csv = csvGestor(g)
  assert.match(csv, /2025;María;Busto Tavera 22;1ºA;Ingresos íntegros \(renta devengada\);Ingreso;6000,00;/)
  assert.match(csv, /Total del edificio/)
  assert.match(csv, /Total del titular/)
  assert.equal(g.titulares[0].totales.ingresosCent, 600_000)
})

test('CSV: coma decimal, texto legal, «sin dato» en lo que no consta y nada de 0 inventado', () => {
  const g = informeGestor(fiscal(), new Map([['i1', { id: 'A', nombre: 'Ana' }]]), 'A')
  const csv = csvGestor(g)
  assert.ok(csv.startsWith('﻿'))
  assert.match(csv, /;Amortización estimada;Resultado;sin dato;/)
  assert.match(csv, /;Rendimiento neto;Resultado;sin dato;/)
  assert.match(csv, /10000,00/)
  assert.ok(csv.includes(TEXTO_LEGAL_GESTOR))
  assert.equal(TEXTO_LEGAL_GESTOR, 'Exportación de tus datos para tu gestor; no es asesoramiento fiscal')
})

test('CSV: una celda con fórmula se neutraliza (inyección en Excel)', () => {
  const inf = informeFiscal(res([inm({ inmuebleId: 'i1' })]), [{ id: 'i1', alias: '=HYPERLINK("x")', titular: 'Ana' }], P)
  const csv = csvGestor(informeGestor(inf, new Map([['i1', { id: 'A', nombre: '=cmd' }]])))
  assert.doesNotMatch(csv, /(^|;|\r\n)=/)
})
