import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// El aviso diario NO tiene criterio propio: usa el de la pantalla (`duplicadasCartera`). Este test lo ata.
const fuente = readFileSync(new URL('./cartera-duplicados.ts', import.meta.url), 'utf8')

test('el aviso de duplicados usa el criterio único de la pantalla, sin SQL ni comodines propios', () => {
  assert.match(fuente, /duplicadasCartera/)
  assert.doesNotMatch(fuente, /\$queryRaw|COMODINES|prismaAsegura/)
})

test('el aviso solo lee y mantiene el tope de 50; null (no se pudo leer) no se convierte en 0', () => {
  assert.match(fuente, /TOPE_MUESTRA_DUPLICADOS = 50/)
  assert.match(fuente, /if \(grupos === null\) return null/)
})
