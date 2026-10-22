import test from 'node:test'
import assert from 'node:assert/strict'

import { cifrarAltaInquilino, cifrarPii, revisarAltaInquilino } from './patrimonio-inquilino-reglas.ts'

const ID = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'

function conEnv<T>(env: Record<string, string | undefined>, f: () => T): T {
  const antes = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]))
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return f()
  } finally {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}
const CLAVES = { PII_ENCRYPTION_KEY: 'a'.repeat(64), PII_LOOKUP_KEY: 'b'.repeat(64), NODE_ENV: 'test' }
const SIN_CLAVES = { PII_ENCRYPTION_KEY: undefined, PII_LOOKUP_KEY: undefined, NODE_ENV: 'test' }

test('🚨 sin PII_ENCRYPTION_KEY no se cifra NADA en claro (el modo desarrollo de encryptField devolvería el texto)', () => {
  conEnv(SIN_CLAVES, () => {
    assert.equal(cifrarPii('12345678Z'), null)
    assert.equal(cifrarAltaInquilino({ nif: '12345678Z', email: null, telefono: null }), null)
    assert.equal(cifrarAltaInquilino({ nif: null, email: 'ana@x.es', telefono: null }), null)
    assert.equal(cifrarAltaInquilino({ nif: null, email: null, telefono: '600000000' }), null)
  })
})

test('con las claves: sobre v1, sin el texto en claro; correo con hash y cifrado a la vez', () => {
  conEnv(CLAVES, () => {
    const c = cifrarAltaInquilino({ nif: '12345678Z', email: 'ana@x.es', telefono: '600000000' })
    assert.ok(c)
    for (const v of [c.nifCifrado, c.emailCifrado, c.telefonoCifrado]) {
      assert.match(v!, /^v1:/)
      assert.doesNotMatch(v!, /12345678Z|ana@x\.es|600000000/)
    }
    assert.ok(c.emailHash && c.emailHash !== 'ana@x.es')
  })
})

test('sin PII que cifrar no hace falta clave (solo nombre)', () => {
  conEnv(SIN_CLAVES, () => {
    assert.deepEqual(cifrarAltaInquilino({ nif: null, email: null, telefono: null }), {
      nifCifrado: null,
      emailCifrado: null,
      emailHash: null,
      telefonoCifrado: null,
    })
  })
})

test('revisarAltaInquilino: reglas de la cartera para NIF/teléfono/correo, y NIF coherente con el tipo', () => {
  const base = { identidadId: ID, contratoId: C, tipo: 'persona', nombre: ' Ana ' }
  const ok = revisarAltaInquilino({ ...base, nif: '12345678-z', telefono: '+34 600 000 000', email: ' Ana@X.es ' })
  assert.deepEqual(ok, {
    ok: true,
    datos: { identidadId: ID, contratoId: C, tipo: 'persona', nombre: 'Ana', papel: 'titular', nif: '12345678Z', email: 'ana@x.es', telefono: '600000000' },
  })
  assert.equal(revisarAltaInquilino({ ...base, nif: '12345678A' }).ok, false)
  const cif = revisarAltaInquilino({ ...base, nif: 'B12345678' })
  assert.equal(cif.ok === false && cif.campo, 'nif')
  assert.equal(revisarAltaInquilino({ ...base, tipo: 'sociedad', nif: 'B12345678' }).ok, true)
  assert.equal(revisarAltaInquilino({ ...base, email: 'no-es-correo' }).ok, false)
  // Sin identidad o contrato válidos no hay alta (no se acepta titular ni ficha del cuerpo).
  assert.equal(revisarAltaInquilino({ ...base, identidadId: 'x' }).ok, false)
  assert.equal(revisarAltaInquilino({ ...base, contratoId: undefined }).ok, false)
})
