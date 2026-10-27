import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { VehiculoFlota } from '@central/module-seguros-portal'

import { flotaImpideTodoAlDia, resumenFlotaInicio, textosFlotaInicio, type SociedadFlotaInicio } from './flota-inicio.ts'

function v(id: string, itv: VehiculoFlota['itv'], estadoVenc: VehiculoFlota['vencimiento']['estado'] = 'vigente'): VehiculoFlota {
  return {
    polizaId: id,
    etiqueta: id,
    matricula: id,
    clave: id,
    compania: 'Mapfre',
    ramo: 'auto',
    vencimiento: { fecha: estadoVenc === 'sin_fecha' ? null : '2027-01-01', diasHasta: estadoVenc === 'sin_fecha' ? null : 120, estado: estadoVenc },
    itv,
    matriculacionDeclarada: null,
  }
}
const itvEn = (pronto: boolean): VehiculoFlota['itv'] => ({
  estado: 'calculada', fecha: '2026-12-01', fiabilidad: 'primera', fuente: 'compania', diasHasta: pronto ? 10 : 200, pronto,
  periodicidadMeses: 12, calculadaComoTurismo: true,
}) as VehiculoFlota['itv']
const sinItv: VehiculoFlota['itv'] = { estado: 'desconocida', motivo: 'sin_matriculacion' }
const soc = (id: string, vehiculos: VehiculoFlota[] | null, recortada = false): SociedadFlotaInicio => ({ id, nombre: id, vehiculos, recortada })

test('flota en Inicio: cuenta ITV próximas, ITV sin saber y seguros que vencen', () => {
  const r = resumenFlotaInicio({
    sociedades: [soc('a', [v('1', itvEn(true)), v('2', itvEn(false), 'pronto'), v('3', sinItv)]), soc('b', [v('4', itvEn(false))])],
    nombramientos: 0,
  })
  assert.deepEqual(r, { sociedades: 2, nombramientos: 0, vehiculos: 4, incompleta: false, itvPronto: 1, itvSinSaber: 1, vencenPronto: 1 })
  const t = textosFlotaInicio(r)
  assert.equal(t.pideAtencion, true)
  assert.match(t.lineas.map((l) => l.texto).join(' '), /1 vehículo tiene la ITV en los próximos 30 días/)
})

test('flota en Inicio: NULL ≠ 0. Una sociedad sin leer deja las cifras en null y la tarjeta dice «no hemos podido comprobar»', () => {
  const r = resumenFlotaInicio({ sociedades: [soc('a', [v('1', itvEn(false))]), soc('b', null)], nombramientos: 0 })
  assert.equal(r.vehiculos, null)
  assert.equal(r.itvPronto, null)
  assert.equal(r.itvSinSaber, null)
  assert.equal(r.vencenPronto, null)
  const t = textosFlotaInicio(r)
  assert.equal(t.lineas[0]!.sinComprobar, true)
  assert.match(t.lineas[0]!.texto, /no hemos podido comprobar/)
  assert.doesNotMatch(t.lineas.map((l) => l.texto).join(' '), /Ninguna ITV|Ningún seguro|\b0 vehículos/)
  assert.equal(t.pideAtencion, false)
})

test('flota en Inicio: 0 vehículos leídos es «no nos consta», no «no hemos podido comprobar»; 0 ITV próximas se dice como cálculo', () => {
  const vacia = textosFlotaInicio(resumenFlotaInicio({ sociedades: [soc('a', [])], nombramientos: 0 }))
  assert.equal(vacia.lineas[0]!.sinComprobar, false)
  assert.match(vacia.lineas[0]!.texto, /No nos consta ningún vehículo/)
  const lejos = textosFlotaInicio(resumenFlotaInicio({ sociedades: [soc('a', [v('1', itvEn(false))])], nombramientos: 0 }))
  const texto = lejos.lineas.map((l) => l.texto).join(' ')
  assert.match(texto, /Ninguna ITV calculada cae en los próximos 30 días/)
  assert.doesNotMatch(texto, /al día/i, 'no existe «ITV al día»')
  assert.equal(lejos.pideAtencion, false)
})

test('flota en Inicio: flota recortada = «al menos»', () => {
  const r = resumenFlotaInicio({ sociedades: [soc('a', [v('1', itvEn(false))], true)], nombramientos: 0 })
  assert.equal(r.incompleta, true)
  assert.match(textosFlotaInicio(r).lineas[0]!.texto, /^Al menos 1 vehículo/)
})

test('flota en Inicio: nombramientos pendientes (null = no se pudo comprobar, 0 = ninguno)', () => {
  const con = textosFlotaInicio(resumenFlotaInicio({ sociedades: [soc('a', [])], nombramientos: 2 }))
  assert.match(con.lineas.at(-1)!.texto, /2 sociedades te han nombrado jefe de flota/)
  assert.equal(con.pideAtencion, true)
  const uno = textosFlotaInicio(resumenFlotaInicio({ sociedades: [], nombramientos: 1 }))
  assert.match(uno.lineas.at(-1)!.texto, /1 sociedad te ha nombrado jefe de flota/)
  assert.equal(uno.lineas.length, 1, 'sin sociedades no se cuentan vehículos')
  const nulo = textosFlotaInicio(resumenFlotaInicio({ sociedades: [soc('a', [])], nombramientos: null }))
  assert.equal(nulo.lineas.at(-1)!.sinComprobar, true)
  assert.equal(nulo.pideAtencion, false)
  const ninguno = textosFlotaInicio(resumenFlotaInicio({ sociedades: [soc('a', [])], nombramientos: 0 }))
  assert.ok(!ninguno.lineas.some((l) => /nombrado/.test(l.texto)))
})

test('flota en Inicio: el «Todo al día» se impide si hay algo pendiente O algo sin comprobar; sin tarjeta no impide nada', () => {
  assert.equal(flotaImpideTodoAlDia(undefined), false)
  assert.equal(flotaImpideTodoAlDia(null), true)
  assert.equal(flotaImpideTodoAlDia({ sociedades: [soc('a', [v('1', itvEn(false))])], nombramientos: 0 }), false)
  assert.equal(flotaImpideTodoAlDia({ sociedades: [soc('a', [v('1', itvEn(true))])], nombramientos: 0 }), true)
  assert.equal(flotaImpideTodoAlDia({ sociedades: [soc('a', null)], nombramientos: 0 }), true)
  assert.equal(flotaImpideTodoAlDia({ sociedades: [soc('a', [])], nombramientos: null }), true)
})
