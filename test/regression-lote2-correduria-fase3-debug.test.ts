import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

test('🪤 la ruta pública temporal /api/subastas/fase3-debug está retirada (auditoría 02/11/2026)', () => {
  assert.equal(existsSync(new URL('../apps/plataforma/app/api/subastas/fase3-debug/route.ts', import.meta.url)), false)
})
