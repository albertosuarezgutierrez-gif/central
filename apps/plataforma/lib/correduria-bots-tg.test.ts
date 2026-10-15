// Bots del tarificador por texto libre en Telegram (15/10/2026): interpretación, lista blanca, tope y botones. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  atascoSigueIgual, candidatasBots, casarCandidatoAtasco, companiasParaRamo, decidirBotonBots, dentroDeTopeBots, esParaBots,
  leerPropuesta, pideAccionProhibida, TOPE_BOTS_EUR, TOPE_BOTS_LLAMADAS, type CandidatoAtascoTg, type OportunidadBots,
} from './correduria-bots-tg.ts'
import { clasificarDestino } from './correduria-asistente.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const ID2 = '22222222-2222-4222-8222-222222222222'

test('esParaBots: los tres ejemplos de Alberto entran; Avant2 y el contable no', () => {
  assert.equal(esParaBots('prueba Allianz en la oportunidad del Hyundai de Manuel'), true)
  assert.equal(esParaBots('el campo atascado es la matrícula'), true)
  assert.equal(esParaBots('¿Cómo va el precio de Manuel?'), true)
  assert.equal(esParaBots('pide precio de la moto de Pablo'), false)
  assert.equal(esParaBots('gasto de 30€ en gasolina'), false)
  assert.equal(esParaBots('pásame el botón de la factura'), false)
})

test('clasificarDestino: un texto de atasco va a la correduría (no al contable ni a la IA clasificadora)', () => {
  assert.equal(clasificarDestino('el campo atascado es la matrícula'), 'correduria')
  assert.equal(clasificarDestino('¿cómo va el precio de Manuel?'), 'correduria')
})

test('pideAccionProhibida: emitir, contratar, pagar, grabar póliza o enviar a terceros', () => {
  for (const t of ['prueba Allianz y emítela', 'contrata la de Mapfre', 'paga el recibo', 'graba la póliza de Manuel', 'mándale el precio a Manuel', 'envíaselo por WhatsApp', 'lanza Mapfre y mándalo por correo']) {
    assert.equal(pideAccionProhibida(t), true, t)
  }
  for (const t of ['el campo atascado es la forma de pago', 'prueba Allianz en la oportunidad del Hyundai de Manuel', 'mándame cómo va el precio', 'el campo es el email']) {
    assert.equal(pideAccionProhibida(t), false, t)
  }
})

test('tope: fail-closed sin recuento, corta en 12 llamadas o 0,50€, deja pasar por debajo', () => {
  assert.equal(dentroDeTopeBots(null).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: Number.NaN, eur: 0 }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: TOPE_BOTS_LLAMADAS, eur: 0 }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: 0, eur: TOPE_BOTS_EUR }).ok, false)
  assert.equal(dentroDeTopeBots({ llamadas: TOPE_BOTS_LLAMADAS - 1, eur: TOPE_BOTS_EUR - 0.01 }).ok, true)
  const t = dentroDeTopeBots({ llamadas: 99, eur: 0 })
  assert.ok(!t.ok && /tope/.test(t.texto))
})

test('companiasParaRamo: solo compañías con bot activo en ESE ramo; «todas»; ninguna inventada', () => {
  const ints = [{ compania: 'mapfre', ramo: 'auto' }, { compania: 'allianz', ramo: 'moto' }, { compania: 'allianz', ramo: 'comunidades' }]
  assert.deepEqual(companiasParaRamo(['Mapfre'], ints, 'auto'), { ok: true, companias: ['mapfre'] })
  assert.deepEqual(companiasParaRamo(['todas'], ints, 'auto'), { ok: true, companias: ['mapfre'] })
  const r = companiasParaRamo(['allianz'], ints, 'auto')
  assert.ok(!r.ok && /allianz/.test(r.motivo) && /mapfre/.test(r.motivo))
  assert.equal(companiasParaRamo([], ints, 'auto').ok, false)
  assert.equal(companiasParaRamo(['mapfre'], ints, 'hogar').ok, false)
})

const op = (o: Partial<OportunidadBots>): OportunidadBots => ({
  id: ID, clienteId: ID2, clienteNombre: 'Manuel', ramo: 'auto', estado: 'en_negociacion', vehiculo: 'HYUNDAI TUCSON', matricula: '1234 BCD', aseguradora: null, ...o,
})

test('candidatasBots: abiertas, ramo con bot desde Telegram y que casan con la pista', () => {
  const ops = [
    op({ id: 'a' }),
    op({ id: 'b', vehiculo: 'SEAT IBIZA', matricula: '9999XYZ' }),
    op({ id: 'c', estado: 'ganada' }),
    op({ id: 'd', ramo: 'moto' }),
    op({ id: 'a' }),
  ]
  assert.deepEqual(candidatasBots(ops, 'Hyundai').map((o) => o.id), ['a'])
  assert.deepEqual(candidatasBots(ops, '1234BCD').map((o) => o.id), ['a'])
  assert.deepEqual(candidatasBots(ops, null).map((o) => o.id), ['a', 'b'])
  assert.deepEqual(candidatasBots(ops, 'Toyota'), [])
})

const cands: CandidatoAtascoTg[] = [
  { n: 1, tag: 'input', texto: 'Matrícula', etiqueta: null, id: null },
  { n: 2, tag: 'input', texto: 'Fecha de matriculación', etiqueta: null, id: null },
  { n: 3, tag: 'select', texto: null, etiqueta: 'Uso del vehículo', id: null },
]

test('casarCandidatoAtasco: por nombre (uno / varios / ninguno) y por número solo si está en la lista', () => {
  assert.deepEqual(casarCandidatoAtasco(cands, 'la matrícula', undefined), { tipo: 'uno', n: 1 })
  assert.deepEqual(casarCandidatoAtasco(cands, 'matricula', undefined), { tipo: 'uno', n: 1 })
  assert.deepEqual(casarCandidatoAtasco(cands, 'matricul', undefined), { tipo: 'varios', ns: [1, 2] })
  assert.equal(casarCandidatoAtasco(cands, 'el garaje', undefined).tipo, 'ninguno')
  assert.deepEqual(casarCandidatoAtasco(cands, null, 3), { tipo: 'uno', n: 3 })
  assert.equal(casarCandidatoAtasco(cands, null, 7).tipo, 'ninguno')
  assert.equal(casarCandidatoAtasco(cands, null, '#mat-input-1').tipo, 'ninguno')
})

test('decidirBotonBots: solo from.id = TELEGRAM_CHAT_ID y `tbot_ok|no:<uuid>`', () => {
  assert.deepEqual(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID], '42'), { ok: true, accion: 'ok', id: ID, quien: '42' })
  assert.equal(decidirBotonBots({ from: { id: 43 } }, 'ok', [ID], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID], undefined).ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', ['1'], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'emitir', [ID], '42').ok, false)
  assert.equal(decidirBotonBots({ from: { id: 42 } }, 'ok', [ID, 'mapfre'], '42').ok, false)
})

test('leerPropuesta: lo guardado se valida; nada raro llega a ejecutarse', () => {
  assert.deepEqual(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'auto', companias: ['mapfre'] }), { tipo: 'tarificar', cuerpo: { oportunidadId: ID, ramo: 'auto', companias: ['mapfre'] } })
  assert.equal(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'moto', companias: ['mapfre'] }), null)
  assert.equal(leerPropuesta('tarificar', { oportunidadId: ID, ramo: 'auto', companias: ['mapfre', 'x;drop'] }), null)
  assert.equal(leerPropuesta('emitir', { oportunidadId: ID }), null)
  assert.equal(leerPropuesta('atasco', { atascoId: ID, n: 2, rotulo: 'Matrícula', selector: '#x' })?.tipo, 'atasco')
  assert.equal(leerPropuesta('atasco', { atascoId: ID, n: 0, rotulo: 'Matrícula' }), null)
})

test('atascoSigueIgual: al confirmar, el número N tiene que ser el MISMO candidato', () => {
  assert.equal(atascoSigueIgual(cands, { atascoId: ID, n: 1, rotulo: 'Matrícula' }), true)
  assert.equal(atascoSigueIgual(cands, { atascoId: ID, n: 2, rotulo: 'Matrícula' }), false)
  assert.equal(atascoSigueIgual(null, { atascoId: ID, n: 1, rotulo: 'Matrícula' }), false)
})

test('cableado: en modo bots el bucle SOLO ejecuta herramientas de bots y el webhook enruta `tbot`', () => {
  const tg = readFileSync(new URL('./correduria-asistente-telegram.ts', import.meta.url), 'utf8')
  assert.match(tg, /if \(bots\) \{\s*\/\/[^\n]*\n\s*res = await ejecutarBots\(/)
  assert.match(tg, /herramientas = bots \? HERRAMIENTAS_BOTS :/)
  assert.match(tg, /if \(bots && pideAccionProhibida\(pregunta\)\)/)
  const wh = readFileSync(new URL('../app/api/sivra/mensajes/telegram-webhook/route.ts', import.meta.url), 'utf8')
  assert.match(wh, /prefix === PREFIJO_BOTS_TG[\s\S]{0,200}decidirBotonBots\(cb, action, args, process\.env\.TELEGRAM_CHAT_ID\)/)
})
