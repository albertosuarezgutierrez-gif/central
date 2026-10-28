import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../../app/(usuario)/correduria/poliza/[id]/page.tsx', import.meta.url), 'utf8')

test('póliza: no hay acceso «Riesgos» ni «Historial del riesgo» (viven dentro de «Qué asegura»)', () => {
  assert.doesNotMatch(src, /titulo:\s*'Riesgos'/)
  assert.doesNotMatch(src, /titulo:\s*'Historial del riesgo'/)
  assert.doesNotMatch(src, /id:\s*'(riesgos|historial)'/)
})

test('póliza: la cabecera no lleva «Retarificar auto» (única entrada: pestaña «Prima y precio»)', () => {
  const cab = src.slice(src.indexOf('<PageHeader'), src.indexOf('<Sustitucion'))
  assert.ok(cab.length > 20)
  assert.doesNotMatch(cab, /rotuloRetarificar|urlRetarificar|Retarificar/)
  assert.match(src, /id: 'prima'/)
})
