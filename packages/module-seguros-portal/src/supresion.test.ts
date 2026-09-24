import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ALCANCE_SUPRESION,
  DIAS_AVISO,
  DIAS_PRORROGA,
  DIAS_RESPUESTA,
  YA_PENDIENTE,
  diasRestantes,
  estadoPlazo,
  fechaLimite,
  loQueSeConserva,
  loQueSeSuprime,
  puedeRegistrar,
  type SolicitudSupresion,
} from './supresion.ts'

const RECIBIDA = new Date('2026-09-05T10:00:00Z')

function sol(p: Partial<SolicitudSupresion> = {}): SolicitudSupresion {
  return { recibidaEn: RECIBIDA, estado: 'recibida', ...p }
}

/** `n` días después de la recepción, para no escribir fechas a mano. */
const dias = (n: number) => new Date(RECIBIDA.getTime() + n * 24 * 60 * 60 * 1000)

test('el plazo es UN MES desde la recepción (art. 12.3), no desde que alguien la mira', () => {
  // Si el reloj arrancara al abrirla el corredor, no contestar nunca sería una
  // forma de no incumplir jamás.
  assert.equal(fechaLimite(sol()).getTime(), dias(DIAS_RESPUESTA).getTime())
})

test('la prórroga suma dos meses más, y solo si consta que se prorrogó', () => {
  const p = sol({ prorrogadaEn: dias(20) })
  assert.equal(fechaLimite(p).getTime(), dias(DIAS_RESPUESTA + DIAS_PRORROGA).getTime())
  // Sin sello de prórroga el plazo NO se estira: prorrogar en silencio incumple
  // igual que no contestar, así que el sello es la prueba de que se avisó.
  assert.equal(fechaLimite(sol()).getTime(), dias(DIAS_RESPUESTA).getTime())
})

test('los cuatro estados del reloj, y el vencido se ve como vencido', () => {
  assert.equal(estadoPlazo(sol(), dias(1)), 'en_plazo')
  assert.equal(estadoPlazo(sol(), dias(DIAS_RESPUESTA - DIAS_AVISO)), 'urgente')
  assert.equal(estadoPlazo(sol(), dias(DIAS_RESPUESTA - 1)), 'urgente')
  // 🚨 Un plazo pasado NO se redondea a «urgente»: es un incumplimiento, y la
  // cola del corredor tiene que poder gritarlo.
  assert.equal(estadoPlazo(sol(), dias(DIAS_RESPUESTA + 1)), 'vencido')
})

test('una solicitud resuelta para el reloj, se resolviera como se resolviera', () => {
  for (const estado of ['resuelta_total', 'resuelta_parcial', 'denegada', 'retirada'] as const) {
    assert.equal(estadoPlazo(sol({ estado }), dias(999)), 'resuelta', `${estado} sigue corriendo`)
  }
  // `en_curso` NO para el reloj: haberla abierto no es haberla contestado.
  assert.equal(estadoPlazo(sol({ estado: 'en_curso' }), dias(999)), 'vencido')
})

test('los días restantes son negativos cuando ya venció, no cero', () => {
  // Colapsar a 0 convertiría «llevo diez días fuera de plazo» en «se acaba hoy».
  assert.equal(diasRestantes(sol(), RECIBIDA), DIAS_RESPUESTA)
  assert.ok(diasRestantes(sol(), dias(DIAS_RESPUESTA + 10)) < 0)
})

test('el alcance dice las DOS cosas: lo que se borra y lo que no', () => {
  // Una lista solo de lo que se borra deja creer que lo demás también. Y una
  // solo de lo que se conserva parece una negativa entera.
  assert.ok(loQueSeSuprime().length > 0, 'si no se borra nada, esto es una negativa, no una supresión')
  assert.ok(loQueSeConserva().length > 0)
  assert.equal(loQueSeSuprime().length + loQueSeConserva().length, ALCANCE_SUPRESION.length)
})

test('cada apartado conservado dice POR QUÉ, con su artículo (art. 12.4)', () => {
  // La negativa parcial hay que motivarla. Un «no se puede» sin base legal es
  // exactamente lo que el art. 12.4 prohíbe.
  for (const a of loQueSeConserva()) {
    assert.match(a.motivo, /art\. 17\.3\.[be]/, `sin base legal: ${a.que}`)
  }
})

test('la propia constancia de la solicitud se conserva: es la prueba de que se atendió', () => {
  const c = loQueSeConserva().find((a) => /solicitud/i.test(a.que))
  assert.ok(c, 'sin esta fila, atender el derecho borraría la prueba de haberlo atendido')
})

test('una pendiente bloquea otra; una resuelta no', () => {
  assert.equal(puedeRegistrar([]), true)
  assert.equal(puedeRegistrar([sol()]), false, 'una recibida ya está en curso')
  assert.equal(puedeRegistrar([sol({ estado: 'en_curso' })]), false)
  // Volver a pedirlo más adelante SÍ se puede: el motivo de conservación decae
  // con el tiempo, y una negativa de hace tres años no vale para siempre.
  assert.equal(puedeRegistrar([sol({ estado: 'denegada' })]), true)
  assert.equal(puedeRegistrar([sol({ estado: 'resuelta_parcial' })]), true)
  assert.equal(puedeRegistrar([sol({ estado: 'retirada' })]), true)
})

test('el texto de «ya pendiente» promete el plazo legal, no un «pronto»', () => {
  assert.match(YA_PENDIENTE, /un mes/)
})
