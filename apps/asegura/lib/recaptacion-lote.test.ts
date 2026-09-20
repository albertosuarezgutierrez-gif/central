import { test } from 'node:test'
import assert from 'node:assert/strict'
import { candidatosLoteEmail } from './recaptacion-lote.ts'
import type { LeadRecaptacion } from './cartera-recaptacion.ts'

function lead(over: Partial<LeadRecaptacion>): LeadRecaptacion {
  return {
    clienteId: 'c1', polizaId: 'p1', cliente: 'Alguien', ramo: 'auto', ramoLegible: 'auto',
    aseguradoraAnterior: null, numeroPoliza: null, telefono: null, email: 'x@example.com',
    prima: null, enCooldown: false, ultimoContactoEn: null,
    origen: 'sin_vencimiento', mesVencimientoAntiguo: null,
    ...over,
  }
}

test('solo entra quien tiene email y NO tiene teléfono usable', () => {
  const leads = [
    lead({ clienteId: 'a', email: 'a@x.com', telefono: null }),
    lead({ clienteId: 'b', email: 'b@x.com', telefono: '600111222' }),
    lead({ clienteId: 'c', email: null, telefono: null }),
  ]
  const r = candidatosLoteEmail(leads)
  assert.deepEqual(r.map((l) => l.clienteId), ['a'])
})

test('un lead en cooldown no entra aunque solo tenga email', () => {
  const leads = [lead({ clienteId: 'a', enCooldown: true })]
  assert.deepEqual(candidatosLoteEmail(leads), [])
})

test('respeta el límite pasado', () => {
  const leads = Array.from({ length: 5 }, (_, i) => lead({ clienteId: `c${i}` }))
  assert.equal(candidatosLoteEmail(leads, 2).length, 2)
})

test('el límite por defecto es 25', () => {
  const leads = Array.from({ length: 30 }, (_, i) => lead({ clienteId: `c${i}` }))
  assert.equal(candidatosLoteEmail(leads).length, 25)
})
