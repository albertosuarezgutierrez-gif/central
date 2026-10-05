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
  // Desde el 05/10/2026 la mejor prima sale de Avant2 (nunca simulada) O de una oferta de compañía REVISADA.
  assert.match(c, /where t3\.oportunidad_id = o\.id and t3\.correduria_id = o\.correduria_id and not t3\.simulado/)
  assert.match(c, /f\.rol = 'oferta'\s+and f\.estado = 'revisada' and f\.prima_total is not null/)
  assert.doesNotMatch(c, /f\.estado <> 'descartada'\s*\n\s*\) b order by/, 'una oferta sin revisar no da «mejor precio»')
})

test('lo tarificado sin oportunidad: acotado a la correduría, sin oportunidad y del tomador (también por su póliza)', () => {
  const c = cuerpoDe('presupuestosSinOportunidad')
  assert.match(c, /t\.correduria_id = \$\{correduriaId\}::uuid and t\.oportunidad_id is null/)
  assert.match(c, /coalesce\(t\.cliente_id, pol\.cliente_id\) = \$\{clienteId\}::uuid/)
  assert.match(c, /limit \$\{TECHO_SIN_OPORTUNIDAD\}/)
})
