import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AMPLIACION_CENTS,
  AVISO_CENTS,
  callbackAmpliar,
  decidirTopeEuros,
  leerArgAmpliar,
  mesClave,
  TOPE_BASE_CENTS,
  textoBloqueo,
  topeDelMes,
  validarAmpliacion,
} from './tope-euros.ts'

const C = 50 // 0,50 € por llamada

test('las cifras de Alberto: aviso a 60 €, bloqueo a 70 €, +30 € por botón', () => {
  assert.equal(AVISO_CENTS, 6000)
  assert.equal(TOPE_BASE_CENTS, 7000)
  assert.equal(AMPLIACION_CENTS, 3000)
})

test('🚨 gasto desconocido NO es 0 €: no se llama (fail-closed)', () => {
  for (const g of [
    { gastadoCents: null, ampliadoCents: 0 },
    { gastadoCents: 0, ampliadoCents: null },
    { gastadoCents: Number.NaN, ampliadoCents: 0 },
  ]) {
    const d = decidirTopeEuros(g, C)
    assert.equal(d.permitido, false)
    assert.equal(d.permitido === false && d.motivo, 'desconocido')
  }
})

test('0 € leídos de verdad SÍ permite, y no avisa', () => {
  const d = decidirTopeEuros({ gastadoCents: 0, ampliadoCents: 0 }, C)
  assert.equal(d.permitido, true)
  assert.equal(d.permitido && d.cruzaAviso, false)
})

test('🚨 el bloqueo: con 69,50 € entra la que deja 70,00 €, la siguiente NO', () => {
  const ultima = decidirTopeEuros({ gastadoCents: 6950, ampliadoCents: 0 }, C)
  assert.equal(ultima.permitido, true)
  const bloqueada = decidirTopeEuros({ gastadoCents: 7000, ampliadoCents: 0 }, C)
  assert.equal(bloqueada.permitido, false)
  assert.equal(bloqueada.permitido === false && bloqueada.motivo, 'bloqueado')
  assert.equal(bloqueada.permitido === false && bloqueada.motivo === 'bloqueado' && bloqueada.topeCents, 7000)
  // Una cotización suelta de más no se cuela aunque «casi» quepa.
  assert.equal(decidirTopeEuros({ gastadoCents: 6990, ampliadoCents: 0 }, C).permitido, false)
})

test('el aviso de 60 €: lo marca la llamada que cruza (y las de después; la BD lo deja en uno)', () => {
  const antes = decidirTopeEuros({ gastadoCents: 5900, ampliadoCents: 0 }, C)
  assert.equal(antes.permitido && antes.cruzaAviso, false)
  const cruza = decidirTopeEuros({ gastadoCents: 5950, ampliadoCents: 0 }, C)
  assert.equal(cruza.permitido && cruza.cruzaAviso, true)
})

test('cada ampliación suma 30 € al tope del mes, y es repetible', () => {
  assert.equal(topeDelMes(0), 7000)
  assert.equal(topeDelMes(3000), 10000)
  assert.equal(topeDelMes(6000), 13000)
  assert.equal(decidirTopeEuros({ gastadoCents: 7000, ampliadoCents: 3000 }, C).permitido, true)
  assert.equal(decidirTopeEuros({ gastadoCents: 10000, ampliadoCents: 3000 }, C).permitido, false)
})

test('el botón: ida y vuelta, y basura → null', () => {
  const cb = callbackAmpliar('2026-10', 7000)
  assert.equal(cb, 'cas_tope:202610-7000')
  assert.ok(cb.length <= 64, 'Telegram limita callback_data a 64 bytes')
  assert.deepEqual(leerArgAmpliar(cb.split(':')[1]!), { mes: '2026-10', nivelCents: 7000 })
  for (const malo of ['', '202613-7000', '2026-10-7000', '202610-100', '202610-abc', '202610-7000;drop']) {
    assert.equal(leerArgAmpliar(malo), null, malo)
  }
})

test('la ampliación solo vale para el mes en curso y desde un bloqueo real', () => {
  const p = { mes: '2026-10', nivelCents: 7000 }
  assert.deepEqual(validarAmpliacion(p, { mesActual: '2026-10', bloqueoEnEseNivel: true }), { ok: true })
  assert.equal(validarAmpliacion(p, { mesActual: '2026-11', bloqueoEnEseNivel: true }).ok, false)
  assert.equal(validarAmpliacion(p, { mesActual: '2026-10', bloqueoEnEseNivel: false }).ok, false)
})

test('el mes es el natural de MADRID, no el de UTC', () => {
  // 31/10 23:30 UTC = 01/11 00:30 en Madrid (CET).
  assert.equal(mesClave(new Date('2026-10-31T23:30:00Z')), '2026-11')
  assert.equal(mesClave(new Date('2026-10-31T22:30:00Z')), '2026-10')
})

test('los textos van en formato español con el € detrás', () => {
  assert.match(textoBloqueo(7000, 7000, '2026-10'), /70,00€ de 70,00€/)
  assert.match(textoBloqueo(7000, 7000, '2026-10'), /\+30,00€/)
})
