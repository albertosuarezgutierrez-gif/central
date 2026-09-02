import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detalleError } from './comisiones-motivo.ts'

test('un P2021 dice QUÉ tabla y en qué schema se buscó', () => {
  const e = Object.assign(new Error('no existe'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2021',
    meta: { table: 'public.corredurias' },
  })
  assert.equal(detalleError(e, 'central'), 'central/PrismaClientKnownRequestError/P2021/public.corredurias')
})

// 🚨 El motivo de que exista este módulo: la pista acaba en un Telegram, y el
// `message` de un fallo de conexión de Prisma trae la cadena entera dentro.
test('NUNCA se cuela la cadena de conexión ni el mensaje crudo', () => {
  const e = Object.assign(
    new Error('Can\'t reach database server at postgresql://prisma_seguros:S3cr3t@host:6543/postgres'),
    { name: 'PrismaClientInitializationError', code: 'P1001' },
  )
  const d = detalleError(e, 'central')
  assert.doesNotMatch(d, /postgres/)
  assert.doesNotMatch(d, /S3cr3t/)
  assert.equal(d, 'central/PrismaClientInitializationError/P1001')
})

test('un error sin nombre ni código sigue diciendo de qué fuente se leía', () => {
  assert.equal(detalleError({}, 'origen'), 'origen/Error')
  assert.equal(detalleError(null, 'central'), 'central/Error')
})

test('campos que no son texto se ignoran en vez de pegarse como [object Object]', () => {
  const d = detalleError({ name: 'X', code: 42, meta: { table: { a: 1 } } }, 'central')
  assert.equal(d, 'central/X')
})
