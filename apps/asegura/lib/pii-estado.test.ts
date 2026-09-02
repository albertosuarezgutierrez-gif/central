import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptField } from '@central/module-seguros-pii'
import { estadoClavePii, explicarClavePii } from './pii-estado.ts'

const CLAVE_A = 'a'.repeat(64)
const CLAVE_B = 'b'.repeat(64)

function cifradoCon(clave: string, texto: string): string {
  const antes = process.env.PII_ENCRYPTION_KEY
  process.env.PII_ENCRYPTION_KEY = clave
  try {
    return encryptField(texto)
  } finally {
    if (antes === undefined) delete process.env.PII_ENCRYPTION_KEY
    else process.env.PII_ENCRYPTION_KEY = antes
  }
}

test('sin clave → sin_clave, aunque haya muestra', () => {
  const muestra = cifradoCon(CLAVE_A, '600000000')
  assert.equal(estadoClavePii(muestra, undefined), 'sin_clave')
  assert.equal(estadoClavePii(muestra, '   '), 'sin_clave')
})

test('clave que no son 64 hex → mal_formada (comillas, corta, con espacios dentro)', () => {
  const muestra = cifradoCon(CLAVE_A, '600000000')
  assert.equal(estadoClavePii(muestra, `"${CLAVE_A}"`), 'mal_formada')
  assert.equal(estadoClavePii(muestra, CLAVE_A.slice(0, 60)), 'mal_formada')
  assert.equal(estadoClavePii(muestra, `${CLAVE_A.slice(0, 32)} ${CLAVE_A.slice(32)}`), 'mal_formada')
})

test('clave válida pero distinta de la que cifró → no_abre; la misma → ok', () => {
  const muestra = cifradoCon(CLAVE_A, '600000000')
  const antes = process.env.PII_ENCRYPTION_KEY
  try {
    process.env.PII_ENCRYPTION_KEY = CLAVE_B
    assert.equal(estadoClavePii(muestra, CLAVE_B), 'no_abre')
    process.env.PII_ENCRYPTION_KEY = CLAVE_A
    assert.equal(estadoClavePii(muestra, CLAVE_A), 'ok')
  } finally {
    if (antes === undefined) delete process.env.PII_ENCRYPTION_KEY
    else process.env.PII_ENCRYPTION_KEY = antes
  }
})

test('sin dato cifrado con el que probar → sin_muestra, nunca ok', () => {
  assert.equal(estadoClavePii(null, CLAVE_A), 'sin_muestra')
  assert.equal(estadoClavePii('600000000', CLAVE_A), 'sin_muestra')
})

test('cada estado tiene su frase y ninguna contiene la clave', () => {
  for (const e of ['ok', 'sin_clave', 'mal_formada', 'no_abre', 'sin_muestra'] as const) {
    const frase = explicarClavePii(e)
    assert.ok(frase.length > 10)
    assert.ok(!frase.includes(CLAVE_A))
  }
})
