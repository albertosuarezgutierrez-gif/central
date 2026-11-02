import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// La marca de la identidad de vista de corredor vive duplicada (apps no se acoplan): que no diverjan.
const marca = (f: string) => /NOMBRE_IDENTIDAD_VISTA\s*=\s*'([^']+)'/.exec(readFileSync(new URL(f, import.meta.url), 'utf8'))?.[1]

test('NOMBRE_IDENTIDAD_VISTA es idéntica en asegura-portal y asegura', () => {
  const a = marca('../apps/asegura-portal/lib/vista-corredor-identidad.ts')
  const b = marca('../apps/asegura/lib/portal-modulos-corredor.ts')
  assert.ok(a, 'no se encontró la constante en asegura-portal')
  assert.equal(b, a)
})
