import { test } from 'node:test'
import assert from 'node:assert/strict'
import { causaErrorCartera, describirErrorCartera } from './error-cartera.ts'

function prismaError(code: string, message: string) {
  const e = new Error(message) as Error & { code: string }
  e.code = code
  return e
}

test('la contraseña equivocada es «credenciales», por código o por mensaje', () => {
  assert.equal(causaErrorCartera(prismaError('P1000', 'Authentication failed against database server')), 'credenciales')
  assert.equal(causaErrorCartera(new Error('password authentication failed for user "prisma_seguros"')), 'credenciales')
})

test('un rol sin USAGE sobre seguros es «permisos»', () => {
  assert.equal(causaErrorCartera(prismaError('P1010', 'User was denied access')), 'permisos')
  assert.equal(causaErrorCartera(new Error('permission denied for schema seguros')), 'permisos')
})

test('red y esquema se distinguen; lo desconocido es «otro», nunca se inventa', () => {
  assert.equal(causaErrorCartera(prismaError('P1001', "Can't reach database server")), 'conexion')
  assert.equal(causaErrorCartera(new Error('connect ECONNREFUSED 1.2.3.4:6543')), 'conexion')
  assert.equal(causaErrorCartera(prismaError('P2021', 'The table does not exist')), 'esquema')
  assert.equal(causaErrorCartera(new Error('relation "corredurias" does not exist')), 'esquema')
  assert.equal(causaErrorCartera(new Error('boom')), 'otro')
  assert.equal(causaErrorCartera(null), 'otro')
})

test('la descripción para el log nunca lleva la URL de conexión (contraseña)', () => {
  const d = describirErrorCartera(
    prismaError('P1000', 'Authentication failed at postgresql://prisma_seguros:S3cr3t@aws-0.pooler.supabase.com:6543/postgres'),
  )
  assert.equal(d.includes('S3cr3t'), false)
  assert.match(d, /^P1000: /)
  assert.match(d, /<url>/)
})
