// Cepo del flujo de retención (pieza 2-b). Lee el FUENTE: lo que vigila vive en SQL crudo y en el
// orden de la transacción, donde ni tsc ni el build miran, e importar el módulo arrastraría Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./eventos-cartera.ts', import.meta.url), 'utf8')

test('la retención se abre DENTRO de la transacción del detector, antes de guardar la foto', () => {
  const abre = src.indexOf('await abrirRetencion(tx,')
  const foto = src.indexOf('insert into cartera_foto')
  assert.ok(abre > 0, 'abrirRetencion con el tx de la detección')
  assert.ok(abre < foto, 'si la retención falla, la foto no se guarda y se reintenta')
})

test('solo anula al vencimiento SIN sustitución abre retención', () => {
  assert.match(src, /e\.tipo !== 'POLIZA_ANULA_AL_VENCIMIENTO' \|\| !esFugaSinExplicar\(e\)/)
  assert.match(src, /p\.sustituida_at is null/)
})

test('no se abre una segunda retención abierta para la misma póliza', () => {
  assert.match(src, /info_riesgo->>'origen' = \$\{ORIGEN_RETENCION\}/)
  assert.match(src, /estado::text in \('competencia', 'en_negociacion', 'pendiente_cliente'\)/)
})
