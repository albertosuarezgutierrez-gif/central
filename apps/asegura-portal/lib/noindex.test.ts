import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// El portal es una pantalla de acceso: indexado solo le quita señal de marca a
// `grupoasegura.es` (ver la cabecera del `metadata` de `app/layout.tsx`).
test('el layout raíz declara noindex para todo el portal', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  const meta = layout.match(/export const metadata\s*=\s*\{[^\n]*\}/)?.[0] ?? ''
  assert.match(meta, /robots:\s*\{\s*index:\s*false/, 'el metadata raíz ya no lleva robots index:false')
})
