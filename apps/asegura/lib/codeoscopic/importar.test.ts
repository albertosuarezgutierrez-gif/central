import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { documentoTomador, ofertasDelProyecto, quoteCrudo, ramoDeLinea } from './importar.ts'

// Forma REAL del `GET /insurances/40842815` (proyecto hecho a mano en la web de Avant2,
// 22/09/2026), sin los datos personales: tomador sustituido y sin riesgo ni direcciones.
const crudo = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../fixtures/codeoscopic/2026-09-26-proyecto-web-avant2.json'), 'utf8'),
)

test('solo son emitibles los precios que ya traen SubmitPolicyApplication', () => {
  const ofertas = ofertasDelProyecto(crudo, '2026-09-26')
  const emitibles = ofertas.filter((o) => o.emitible)
  assert.deepEqual(emitibles.map((o) => o.quoteId), ['Q2024306868', 'Q2024763856'])
  assert.equal(ofertas.length, 21)
  // Los emitibles van primero, y entre ellos el más barato.
  assert.equal(ofertas[0].quoteId, 'Q2024306868')
  assert.match(ofertas.find((o) => o.quoteId === 'Q2024306468')!.motivo!, /sin confirmar en Avant2/)
})

test('la semestral: prima anual y primer recibo por separado', () => {
  const s = ofertasDelProyecto(crudo, '2026-09-26').find((o) => o.quoteId === 'Q2024763856')!
  assert.equal(s.compania, 'Allianz')
  assert.equal(s.categoria, 'Terceros Ampliado')
  assert.equal(s.pago, 'Semestral')
  assert.equal(s.primaEur, 520.97)
  assert.equal(s.primerReciboEur, 241.3)
  assert.equal(s.efecto, '2026-09-29')
  assert.equal(s.caduca, '2026-09-29')
})

test('el día de la caducidad aún vale; al siguiente, no', () => {
  const el29 = ofertasDelProyecto(crudo, '2026-09-29').find((o) => o.quoteId === 'Q2024763856')!
  assert.equal(el29.emitible, true)
  const el30 = ofertasDelProyecto(crudo, '2026-09-30').find((o) => o.quoteId === 'Q2024763856')!
  assert.equal(el30.emitible, false)
  assert.match(el30.motivo!, /caducó el 2026-09-29/)
})

test('una fecha de efecto pasada bloquea aunque no traiga caducidad', () => {
  const sinCaducidad = {
    effectiveDate: '2026-09-20',
    mainQuotes: [{ id: 'Q1', premium: 100, actions: [{ id: 'SubmitPolicyApplication' }] }],
  }
  const [o] = ofertasDelProyecto(sinCaducidad, '2026-09-26')
  assert.equal(o.emitible, false)
  assert.match(o.motivo!, /ya ha pasado/)
})

test('ramo, tomador y quote crudo', () => {
  assert.equal(ramoDeLinea(crudo), 'auto')
  assert.equal(ramoDeLinea({ insuranceLine: { id: 'Home' } }), null)
  assert.equal(documentoTomador(crudo), '00000000T')
  assert.equal(documentoTomador({}), null)
  assert.equal(quoteCrudo(crudo, 'Q2024763856')?.premium, 520.97)
  assert.equal(quoteCrudo(crudo, 'Q-no-existe'), null)
})
