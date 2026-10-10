import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import { cifrarJsonEstricto, descifrarJsonEstricto } from './json-cifrado.ts'

function conClave(hex: string | undefined, fn: () => void) {
  const prev = process.env.PII_ENCRYPTION_KEY
  if (hex === undefined) delete process.env.PII_ENCRYPTION_KEY
  else process.env.PII_ENCRYPTION_KEY = hex
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.PII_ENCRYPTION_KEY
    else process.env.PII_ENCRYPTION_KEY = prev
  }
}

const CLAVE = randomBytes(32).toString('hex')
const PII = { contrarios: [{ conductor: 'Pepa Ruiz', matricula: '1234ABC', telefono: '600111222' }] }

test('ida y vuelta: el objeto sale igual y el sobre no contiene nada en claro', () => {
  conClave(CLAVE, () => {
    const sobre = cifrarJsonEstricto(PII)
    assert.ok(sobre.startsWith('v1:'))
    for (const t of ['Pepa', '1234ABC', '600111222', 'contrarios']) assert.equal(sobre.includes(t), false, t)
    assert.deepEqual(descifrarJsonEstricto(sobre), PII)
  })
})

test('🚨 sin clave LANZA (nunca el modo en claro de encryptField), también fuera de producción', () => {
  conClave(undefined, () => {
    assert.throws(() => cifrarJsonEstricto(PII), /PII_ENCRYPTION_KEY/)
    assert.throws(() => descifrarJsonEstricto('v1:a:b:c'), /PII_ENCRYPTION_KEY/)
  })
})

test('un JSON en claro en la columna no se da por bueno; otra clave tampoco abre el sobre', () => {
  let sobre = ''
  conClave(CLAVE, () => {
    sobre = cifrarJsonEstricto(PII)
    assert.throws(() => descifrarJsonEstricto(JSON.stringify(PII)), /no es un sobre/)
  })
  conClave(randomBytes(32).toString('hex'), () => assert.throws(() => descifrarJsonEstricto(sobre)))
})
