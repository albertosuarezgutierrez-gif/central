import test from 'node:test'
import assert from 'node:assert/strict'

import { FUENTES_AVISO, TIPOS_AVISO } from './avisos.ts'
import {
  FUENTES_AVISO_CON_FECHA,
  TIPOS_AVISO_CON_FECHA,
  avisosDeFechaIncompletos,
  ORIGENES_CALENDARIO,
  componerCalendario,
  diasHastaDia,
  type EntradaCalendarioCruda,
  type FuenteCalendario,
  type OrigenCalendario,
} from './calendario-unico.ts'

const HOY = '2026-10-26'
const e = (clave: string, fecha: string | null, extra: Partial<EntradaCalendarioCruda> = {}): EntradaCalendarioCruda => ({
  clave,
  titulo: clave,
  fecha,
  href: '/x',
  ...extra,
})
const fuentes = (parcial: Partial<Record<OrigenCalendario, FuenteCalendario>> = {}): Record<OrigenCalendario, FuenteCalendario> => ({
  seguro: [],
  recibo: [],
  patrimonio: [],
  recordatorio: [],
  aviso: [],
  ...parcial,
})

test('todo leído y sin nada: el calendario está vacío', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes() })
  assert.equal(c.vacio, true)
  assert.deepEqual(c.sinComprobar, [])
})

test('una fuente que falla se DECLARA y el calendario no se da por vacío', () => {
  for (const o of ORIGENES_CALENDARIO) {
    const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ [o]: null }) })
    assert.deepEqual(c.sinComprobar, [o], o)
    assert.equal(c.vacio, false, `${o}: «no se ha podido comprobar» no es «nada»`)
  }
})

test('con una fuente caída y otra con datos, salen los datos y se declara la caída', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ recibo: null, seguro: [e('a', '2026-11-01')] }) })
  assert.equal(c.entradas.length, 1)
  assert.deepEqual(c.sinComprobar, ['recibo'])
  assert.equal(c.vacio, false)
})

test('se ordena por fecha, lo vencido primero y lo que no tiene fecha al final', () => {
  const c = componerCalendario({
    hoy: HOY,
    fuentes: fuentes({
      seguro: [e('s-futuro', '2027-01-10'), e('s-hoy', HOY)],
      recibo: [e('r-pasado', '2026-10-01', { urgente: true })],
      recordatorio: [e('sin-fecha', null), e('rec', '2026-11-05')],
    }),
  })
  assert.deepEqual(c.entradas.map((x) => x.clave), ['r-pasado', 's-hoy', 'rec', 's-futuro', 'sin-fecha'])
  assert.deepEqual(c.entradas.map((x) => x.tramo), ['vencida', 'hoy', 'proxima', 'despues', 'sin_fecha'])
  assert.equal(c.entradas[0]!.dias, -25)
  assert.equal(c.entradas[0]!.origen, 'recibo')
})

test('una fecha que no es fecha se vuelve «sin fecha», nunca una fecha inventada', () => {
  const c = componerCalendario({
    hoy: HOY,
    fuentes: fuentes({ seguro: [e('a', '2026-02-31'), e('b', 'mañana'), e('c', '0001-01-01X')] }),
  })
  for (const x of c.entradas) {
    assert.equal(x.fecha, null)
    assert.equal(x.dias, null)
    assert.equal(x.tramo, 'sin_fecha')
  }
})

test('los avisos van aparte y no se mezclan con las fechas', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ aviso: [e('itv', null)], seguro: [e('s', '2026-12-01')] }) })
  assert.deepEqual(c.avisos.map((x) => x.clave), ['itv'])
  assert.deepEqual(c.entradas.map((x) => x.clave), ['s'])
  assert.equal(c.vacio, false)
})

test('solo avisos: tampoco está vacío', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ aviso: [e('a', null)] }) })
  assert.equal(c.vacio, false)
})

test('diasHastaDia', () => {
  assert.equal(diasHastaDia('2026-10-27', HOY), 1)
  assert.equal(diasHastaDia(HOY, HOY), 0)
  assert.equal(diasHastaDia('2026-10-25', HOY), -1)
  assert.equal(diasHastaDia(null, HOY), null)
  assert.equal(diasHastaDia('2026-10-27', 'hoy'), null)
})

test('avisos incompletos: se enseñan los que hay Y se declara que faltan fuentes; no está vacío', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ aviso: [] }), incompletas: ['aviso'] })
  assert.deepEqual(c.sinComprobar, ['aviso'])
  assert.equal(c.vacio, false)
  const d = componerCalendario({ hoy: HOY, fuentes: fuentes({ aviso: [e('x', null)] }), incompletas: ['aviso'] })
  assert.equal(d.avisos.length, 1)
  assert.deepEqual(d.sinComprobar, ['aviso'])
})

test('una fuente caída Y marcada incompleta se declara una sola vez', () => {
  const c = componerCalendario({ hoy: HOY, fuentes: fuentes({ aviso: null }), incompletas: ['aviso'] })
  assert.deepEqual(c.sinComprobar, ['aviso'])
})

test('avisosDeFechaIncompletos: solo cuentan las fuentes de las que salen avisos de fecha', () => {
  assert.equal(avisosDeFechaIncompletos([]), false)
  assert.equal(avisosDeFechaIncompletos(['firmas', 'felicitaciones', 'autorizaciones']), false)
  for (const f of FUENTES_AVISO_CON_FECHA) assert.equal(avisosDeFechaIncompletos([f]), true, f)
})

test('los tipos y fuentes de «con fecha» existen en el catálogo de la campana', () => {
  for (const t of TIPOS_AVISO_CON_FECHA) assert.ok((TIPOS_AVISO as readonly string[]).includes(t), t)
  for (const f of FUENTES_AVISO_CON_FECHA) assert.ok((FUENTES_AVISO as readonly string[]).includes(f), f)
})
