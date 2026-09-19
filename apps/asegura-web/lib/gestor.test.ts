import test from 'node:test'
import assert from 'node:assert/strict'

import { revisarCopy, explicarInfracciones, normaPorId } from '@central/module-seguros'

import { GESTOR, textoGestor } from './gestor.ts'
import { DIAS_PREAVISO, calcularLinea, parsearFecha, resumirLineas } from './calculadora-vencimientos.ts'

// ── El copy de la landing pasa por el MISMO cepo que ramos y artículos ────────

test('la landing del gestor no promete precio, ahorro ni acota el ámbito', () => {
  const infracciones = revisarCopy(textoGestor())
  assert.equal(infracciones.length, 0, explicarInfracciones(infracciones))
})

test('la landing no promete lo que el portal todavía no hace (aviso saliente, envío de la carta)', () => {
  const t = textoGestor()
  // El cron de correo está apagado y WhatsApp no existe: no se puede afirmar
  // que «te avisamos por correo/WhatsApp». Se dice que la fecha se ENSEÑA.
  assert.doesNotMatch(t, /te avisamos por (correo|email|whatsapp)/i)
  assert.doesNotMatch(t, /whatsapp/i)
  // La carta la manda la persona, nunca el portal.
  assert.doesNotMatch(t, /(la|te la) enviamos (nosotros )?a (tu|la) compañ[ií]a/i)
  assert.doesNotMatch(t, /cancelamos/i)
})

test('title y description caben en la SERP', () => {
  assert.ok(GESTOR.title.length >= 30 && GESTOR.title.length <= 65, `title: ${GESTOR.title.length}`)
  assert.ok(GESTOR.description.length >= 110 && GESTOR.description.length <= 170, `description: ${GESTOR.description.length}`)
  assert.doesNotMatch(GESTOR.title, /Grupo\s+ASegura/i)
})

test('las normas que cita están en la lista blanca verificada, y el texto de verdad las nombra', () => {
  for (const id of GESTOR.base) assert.ok(normaPorId(id), `norma ${id} no verificada`)
  assert.match(textoGestor(), /art[ií]culo 22 de la Ley de Contrato de Seguro/)
})

test('la landing dice las cuatro cosas que la hacen distinta de un comparador', () => {
  const t = textoGestor()
  assert.match(t, /cualquier compañ[ií]a/i)
  assert.match(t, /sin ser cliente|seas cliente o no/i)
  assert.match(t, /no se guarda|no se almacena/i)
  assert.match(t, /casilla aparte|independiente/i)
})

// ── La calculadora: la misma aritmética que el portal ────────────────────────

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

test('el preaviso son 30 días, en días y no en meses', () => {
  assert.equal(DIAS_PREAVISO, 30)
  const r = calcularLinea({ etiqueta: 'Coche', vence: '2026-03-31' }, utc(2026, 1, 1))
  // 31/03 − 30 días = 01/03. Restar «un mes» daría un 31/02 → 3 de marzo.
  assert.equal(r.limite?.toISOString().slice(0, 10), '2026-03-01')
})

test('estados: sin fecha, pasado, urgente (≤30 d), próximo (≤90 d), lejos', () => {
  const hoy = utc(2026, 1, 1)
  assert.equal(calcularLinea({ etiqueta: 'a', vence: '' }, hoy).estado, 'sin_fecha')
  assert.equal(calcularLinea({ etiqueta: 'a', vence: 'ayer' }, hoy).estado, 'sin_fecha')
  assert.equal(calcularLinea({ etiqueta: 'a', vence: '2026-01-15' }, hoy).estado, 'pasado') // límite 16/12/2025
  assert.equal(calcularLinea({ etiqueta: 'a', vence: '2026-02-15' }, hoy).estado, 'urgente') // límite 16/01
  assert.equal(calcularLinea({ etiqueta: 'a', vence: '2026-04-15' }, hoy).estado, 'proximo') // límite 16/03 → 74 d
  assert.equal(calcularLinea({ etiqueta: 'a', vence: '2026-09-15' }, hoy).estado, 'lejos')
})

test('una fecha que no existe (30 de febrero) no se acepta como el 2 de marzo', () => {
  assert.equal(parsearFecha('2026-02-30'), null)
  assert.equal(parsearFecha('2026-13-01'), null)
  assert.ok(parsearFecha('2028-02-29'))
  // `Date.UTC(50, …)` sería 1950: un año de dos cifras no es una fecha, no otra fecha.
  assert.equal(parsearFecha('0050-01-01'), null)
})

test('el resumen cuenta con fecha, próximas (90 d), urgentes y pasadas, y no cuenta las vacías', () => {
  const hoy = utc(2026, 1, 1)
  const r = resumirLineas(
    [
      { etiqueta: 'a', vence: '' },
      { etiqueta: 'b', vence: '2026-02-15' }, // urgente
      { etiqueta: 'c', vence: '2026-04-15' }, // próximo
      { etiqueta: 'd', vence: '2026-01-10' }, // pasado
      { etiqueta: 'e', vence: '2027-01-10' }, // lejos
    ],
    hoy,
  )
  assert.equal(r.conFecha, 4)
  assert.equal(r.proximas, 2)
  assert.equal(r.urgentes, 1)
  assert.equal(r.pasadas, 1)
})
