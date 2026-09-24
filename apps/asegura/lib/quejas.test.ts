// Cepos del registro de quejas. Leen el FUENTE a propósito: lo que vigilan vive dentro de SQL
// (`$queryRaw`), donde ni tsc ni el build miran, y así no se importa el cliente de Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./quejas.ts', import.meta.url), 'utf8')

test('🪤 el detalle y la respuesta se guardan CIFRADOS (cuentan lo que le pasó a una persona)', () => {
  assert.match(src, /\$\{encryptField\(alta\.detalle\)\}/)
  assert.match(src, /respuesta \? encryptField\(respuesta\) : null/)
})

test('🪤 toda lectura y escritura va acotada a la correduría', () => {
  assert.match(src, /where q\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(src, /where id = \$\{id\}::uuid and correduria_id = \$\{correduriaId\}::uuid and estado = \$\{actual\.estado\}/)
})

test('🪤 el cambio de estado no pisa otro clic: el UPDATE exige el estado que se leyó', () => {
  assert.match(src, /and estado = \$\{actual\.estado\}`/)
  assert.match(src, /if \(n === 0\) return \{ estado: 'no_permitida'/)
})

test('🪤 el plazo NO lo pone quien llama: sale de la regla del módulo', () => {
  assert.match(src, /const plazo = plazoQueja\(alta\.recibidaEl\)/)
  assert.doesNotMatch(src, /cuerpo\?\.\s*plazo/)
})

test('🪤 la fecha de respuesta que manda quien llama se valida contra la recepción antes de escribirla', () => {
  assert.match(src, /validarFechaResolucion\(actual\.recibidaEl, resueltaPedida, hoy\)/)
  assert.match(src, /then \$\{resueltaEl\}::date/)
})

test('🪤 una respuesta que la clave no abre se declara, no se pinta como «sin respuesta»', () => {
  assert.match(src, /respuestaIlegible: campoIlegible\(f\.respuesta\)/)
})
