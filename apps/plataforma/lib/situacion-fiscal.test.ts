// Runner: `node --test lib/situacion-fiscal.test.ts` (type-stripping). Puro: sin BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTERESES_FINANCIACION, interesesParaSimulador } from './base-fiscal-devengo.ts'
import { armarPanel } from './fiscal-panel.ts'
import { armarSituacion, formatearValor, validarCampo, type EntradaSituacion } from './situacion-fiscal.ts'

const base: EntradaSituacion = {
  hoy: '2026-10-31', perfil: null, hijos: [], titularidad: [],
  nombresPiso: { prop_house_sevillana: 'Socorro', prop_duplex_center: 'Dúplex' },
}
const buscar = (e: EntradaSituacion, id: string) => armarSituacion(e).flatMap(s => s.datos).find(d => d.id === id)!

test('Alberto 31/10/2026: Socorro y Dúplex sin hipoteca → intereses = 0 (VALOR, no «sin dato»)', () => {
  for (const id of ['prop_house_sevillana', 'prop_duplex_center']) {
    assert.equal(INTERESES_FINANCIACION[id].anual, 0)
    assert.equal(interesesParaSimulador()[id], 0)
    assert.equal(Object.is(interesesParaSimulador()[id], 0), true)
  }
  const d = buscar(base, 'int_prop_house_sevillana')
  assert.equal(d.valor, 0)
  assert.equal(formatearValor(d.valor, d.formato), '0,00€')
  assert.match(d.fuente, /sin hipoteca/)
})

test('el motor lee los intereses: armarPanel los pasa en todas las entradas (y no hay clave para Bustos)', () => {
  const b = {
    anio: 2026, hoy: '2026-10-31', propiedades: [], avisos: {},
    hastaHoy: { porMes: [], lineas: [] }, estimacion: { escenarios: [] },
  } as unknown as Parameters<typeof armarPanel>[0]
  const p = armarPanel(b, { descendientes: [], conyugeTrabaja: false })
  assert.deepEqual(p.entradaHoy.intereses, { prop_house_sevillana: 0, prop_duplex_center: 0 })
  assert.equal((p.entradaHoy.intereses as Record<string, number>)?.prop_luxury_busto, undefined)
})

test('sin perfil: todo lo del perfil es «sin dato» (null), nunca 0', () => {
  for (const id of ['modalidad', 'familia_numerosa', 'plan_pensiones', 'donativos', 'pilar_cuota', 'pilar_exonerados', 'ret_pilar', 'm130', 'm115', 'valor_adq']) {
    const d = buscar(base, id)
    assert.equal(d.valor, null, id)
    assert.equal(formatearValor(d.valor, d.formato), 'sin dato', id)
  }
})

test('con perfil: un 0 guardado es valor; cuota NULL sigue siendo «sin dato»; hijos con edad', () => {
  const e: EntradaSituacion = {
    ...base,
    perfil: { declaracion_conjunta: true, familia_numerosa: null, aportacion_plan_pensiones: '0', conyuge_cuota_autonomos: null, conyuge_retenciones: '0.00', updated_at: '2026-10-30T10:00:00Z' },
    hijos: [{ nombre: 'Ana', fechaNacimiento: '2024-04-11', gradoDiscapacidad: 0 }],
    titularidad: [
      { propiedad_id: 'prop_house_sevillana', titular: 'alberto', porcentaje: '50.00', regimen: 'propiedad', updated_at: '2026-10-30T10:00:00Z' },
      { propiedad_id: 'prop_house_sevillana', titular: 'pilar', porcentaje: '50.00', regimen: 'propiedad', updated_at: '2026-10-30T10:00:00Z' },
    ],
  }
  assert.equal(buscar(e, 'modalidad').valor, 'Conjunta')
  assert.equal(buscar(e, 'familia_numerosa').valor, 'No')
  assert.equal(buscar(e, 'plan_pensiones').valor, 0)
  assert.equal(buscar(e, 'ret_pilar').valor, 0)
  assert.equal(buscar(e, 'pilar_cuota').valor, null)
  assert.equal(buscar(e, 'plan_pensiones').actualizado, '2026-10-30')
  assert.equal(buscar(e, 'hijo_0').valor, '11/04/2024 · 2 años a 31/12')
  assert.equal(buscar(e, 'tit_prop_house_sevillana').valor, 'Alberto 50 % / Pilar 50 %')
})

test('amortización: solo lectura con su fuente; Bustos no aplica (null con nota)', () => {
  const s = buscar(base, 'amort_prop_house_sevillana')
  assert.equal(s.edicion, 'solo_lectura')
  assert.ok(typeof s.valor === 'number' && s.valor > 0)
  assert.match(s.fuente, /AMORTIZACION_INMUEBLES/)
  assert.equal(buscar(base, 'amort_prop_luxury_busto').valor, null)
})

test('validarCampo: rango, enteros, null y campos no editables', () => {
  assert.deepEqual(validarCampo('conyuge_cuota_autonomos', '1.234,5'.replace('.', '')), { ok: true, valor: 1234.5 })
  assert.deepEqual(validarCampo('conyuge_cuota_autonomos', null), { ok: true, valor: null })
  assert.deepEqual(validarCampo('conyuge_cuota_autonomos', 0), { ok: true, valor: 0 })
  assert.equal(validarCampo('conyuge_meses_exonerados', 13).ok, false)
  assert.equal(validarCampo('conyuge_meses_exonerados', 2.5).ok, false)
  assert.equal(validarCampo('conyuge_meses_exonerados', 3).ok, true)
  assert.equal(validarCampo('conyuge_cuota_autonomos', -1).ok, false)
  assert.equal(validarCampo('conyuge_cuota_autonomos', NaN).ok, false)
  assert.equal(validarCampo('donativos_anual; DROP TABLE x', 5).ok, false)
})
