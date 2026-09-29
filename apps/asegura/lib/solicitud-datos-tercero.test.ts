import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Lee el FUENTE: lo que vigila vive en Prisma.sql (ni tsc ni el build miran dentro).
const src = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')

test('datos de un tercero: solo de quien figura en el riesgo', () => {
  assert.match(src, /from oportunidad_figura\s+where oportunidad_id = \$\{oportunidadId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and cliente_id = \$\{persona\}::uuid/)
})

test('datos de un tercero: sin consentimiento no se guardan, y no se rellena su DNI en la página', () => {
  assert.match(src, /if \(f\.tercero && consentimiento !== true\)/)
  const i = src.indexOf('if (f.tercero) return')
  assert.ok(i > 0 && i < src.indexOf('const id = await identidadFicha(f)\n  const campos'), 'el tercero sale antes de leer la identidad')
  assert.match(src, /consentimiento_at = case when tercero then now\(\) else null end/)
})

test('la tarea «Tarificar» va al cliente de la oportunidad, no al tercero', () => {
  assert.match(src, /\$\{o\.clienteId\}::uuid, \$\{f\.oportunidadId\}::uuid, 'central:seguimiento'/)
})
