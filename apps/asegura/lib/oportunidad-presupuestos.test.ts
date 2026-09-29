import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lee el FUENTE: lo que vigila vive en Prisma.sql, donde ni tsc ni el build miran, y el módulo
// importa el cliente generado (el job de tests corre sin `prisma generate`).
const src = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const cuerpoDe = (nombre: string) => {
  const i = src.indexOf(`export async function ${nombre}`)
  assert.ok(i >= 0, `falta ${nombre}`)
  const j = src.indexOf('\nexport ', i + 10)
  return src.slice(i, j < 0 ? undefined : j)
}

test('los precios de cada oportunidad: solo los suyos, de esta correduría, y la mejor prima nunca simulada', () => {
  const c = cuerpoDe('oportunidadesDeCliente')
  assert.match(c, /where t\.oportunidad_id = o\.id and t\.correduria_id = o\.correduria_id/)
  assert.match(c, /min\(x\.prima_eur\) filter \(where not t\.simulado\)/)
  assert.match(c, /filter \(where x\.prima_eur is not null and not t\.simulado\)/)
})

test('lo tarificado sin oportunidad: acotado a la correduría, sin oportunidad y del tomador (también por su póliza)', () => {
  const c = cuerpoDe('presupuestosSinOportunidad')
  assert.match(c, /t\.correduria_id = \$\{correduriaId\}::uuid and t\.oportunidad_id is null/)
  assert.match(c, /coalesce\(t\.cliente_id, pol\.cliente_id\) = \$\{clienteId\}::uuid/)
  assert.match(c, /limit \$\{TECHO_SIN_OPORTUNIDAD\}/)
})
