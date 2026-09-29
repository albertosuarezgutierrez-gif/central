import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./emision-figuras.ts', import.meta.url), 'utf8')
const ruta = readFileSync(new URL('../app/api/operador/codeoscopic/emitir/route.ts', import.meta.url), 'utf8')

test('se compara contra la PRIMERA variante del riesgo (las reglas, en emision-figuras-reglas.test.ts)', () => {
  assert.match(src, /order by t\.creado_at asc limit 1/)
  assert.match(src, /cambiosDeFiguras\(/)
})

test('toda lectura y escritura va acotada a la correduría', () => {
  const consultas = src.match(/from seguros\.\w+[^`]*`/g) ?? []
  assert.ok(consultas.length >= 4)
  for (const c of consultas) assert.match(c, /correduria_id = \$\{correduriaId\}::uuid|correduria_id = pol\.correduria_id|correduria_id = t\.correduria_id/, c.slice(0, 80))
})

test('emitir: sin las confirmaciones NO hay Submit (409), y sin poder mirarlo tampoco (503, fail-closed)', () => {
  const i = ruta.indexOf("causa: 'confirmar_figuras'")
  const submit = ruta.indexOf('await enviarEmision(')
  assert.ok(i > 0 && submit > 0 && i < submit, 'la guarda va ANTES del Submit')
  assert.match(ruta, /if \(!leidos\.ok\)[\s\S]{0,500}status: 503/)
  assert.match(ruta, /if \(!registrado\)[\s\S]{0,500}status: 503/)
})

test('emitir: tras acuñar, las figuras pasan a la póliza en los DOS caminos', () => {
  assert.equal((ruta.match(/await figurasAPoliza\(/g) ?? []).length, 2)
  assert.match(src, /not exists \(/, 'no repite un interviniente que ya está')
  assert.match(src, /if \(!cliente \|\| cliente === tomador\) continue/, 'el tomador ya es polizas.cliente_id')
})
