import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mesesDelRango, mesAniosAtras, diasDelMes, agregarPisos, variacionPct, adr, ocupacionPct,
} from './pl-rango-logica.ts'
import type { PLMensual, PLPiso } from './pl-mensual.ts'

test('mesesDelRango expande incluyendo los extremos y cruza el año', () => {
  assert.deepEqual(mesesDelRango('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02'])
  assert.deepEqual(mesesDelRango('2026-07', '2026-07'), ['2026-07'])
})

test('mesesDelRango rechaza formato inválido, rango invertido y rangos por encima del tope', () => {
  assert.equal(mesesDelRango('2026-13', '2026-14'), null)
  assert.equal(mesesDelRango('2026-7', '2026-08'), null)
  assert.equal(mesesDelRango('2026-08', '2026-07'), null)
  assert.equal(mesesDelRango('2020-01', '2026-01'), null) // 73 meses > tope 24
  assert.deepEqual(mesesDelRango('2026-01', '2026-02', 2), ['2026-01', '2026-02'])
  assert.equal(mesesDelRango('2026-01', '2026-03', 2), null)
})

test('mesesDelRango respeta el tope exacto', () => {
  // tope 24 → hasta 25 meses NO: el tope es de meses totales - 1 iteraciones extra.
  assert.equal(mesesDelRango('2024-01', '2025-12')?.length, 24)
  assert.equal(mesesDelRango('2024-01', '2026-01'), null)
})

test('mesAniosAtras y diasDelMes', () => {
  assert.equal(mesAniosAtras('2026-07'), '2025-07')
  assert.equal(diasDelMes('2026-02'), 28)
  assert.equal(diasDelMes('2024-02'), 29)
  assert.equal(diasDelMes('2026-07'), 31)
})

function piso(p: Partial<PLPiso> & { propertyId: string }): PLPiso {
  return {
    nombre: p.propertyId, maxHuespedes: 4, ingresos: 0, reservas: 0, noches: 0, nochesSinDato: 0,
    gastos: {
      lavanderia: 0, lavanderiaDetalle: { giraldillo: 0, siqueBrilla: 0 },
      limpieza: 0, alquiler: 0, suministros: 0, comunidad: 0, otros: 0, total: 0,
    },
    resultado: 0, margen: 0,
    ...p,
    ...(p.gastos ? { gastos: p.gastos } : {}),
  } as PLPiso
}

function mes(m: string, pisos: PLPiso[]): PLMensual {
  return { mes: m, pisos, desglose: { pagos: [], sinDesglosar: 0, facturasIlegibles: null } }
}

test('agregarPisos suma meses por piso y recalcula margen sobre el agregado', () => {
  const a1 = piso({ propertyId: 'a', ingresos: 100, reservas: 2, noches: 4 })
  a1.gastos.limpieza = 40; a1.gastos.total = 40
  const a2 = piso({ propertyId: 'a', ingresos: 300, reservas: 1, noches: 6 })
  a2.gastos.limpieza = 60; a2.gastos.total = 60
  const out = agregarPisos([mes('2026-01', [a1]), mes('2026-02', [a2])])
  assert.equal(out.length, 1)
  assert.equal(out[0].ingresos, 400)
  assert.equal(out[0].reservas, 3)
  assert.equal(out[0].noches, 10)
  assert.equal(out[0].gastos.total, 100)
  assert.equal(out[0].resultado, 300)
  assert.equal(out[0].margen, 75) // 300/400 — nunca el promedio de márgenes mensuales (60%+80%)/2
})

test('agregarPisos acumula nochesSinDato en vez de tratarlas como 0 noches', () => {
  const a = piso({ propertyId: 'a', ingresos: 100, reservas: 2, noches: 3, nochesSinDato: 1 })
  const b = piso({ propertyId: 'a', ingresos: 100, reservas: 1, noches: 0, nochesSinDato: 1 })
  const out = agregarPisos([mes('2026-01', [a]), mes('2026-02', [b])])
  assert.equal(out[0].noches, 3)
  assert.equal(out[0].nochesSinDato, 2)
})

test('variacionPct: sin base o base 0 → null, nunca un % inventado', () => {
  assert.equal(variacionPct(120, 100), 20)
  assert.equal(variacionPct(80, 100), -20)
  assert.equal(variacionPct(120, 0), null)
  assert.equal(variacionPct(120, null), null)
})

test('adr y ocupacionPct devuelven null sin denominador', () => {
  assert.equal(adr(300, 3), 100)
  assert.equal(adr(300, 0), null)
  assert.equal(ocupacionPct(15, 30), 50)
  assert.equal(ocupacionPct(15, 0), null)
})
