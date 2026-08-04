// apps/plataforma/lib/reescritura-guardia.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportsDe, validarReescritura } from './reescritura-guardia.ts'

const ORIGINAL = `// apps/plataforma/lib/dinero.ts
export function eur(n: number): string {
  const v = Number.isFinite(n) ? n : 0
  return \`\${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€\`
}
`

test('exportsDe: detecta function/const/type/class y export {}', () => {
  const cod = `export function eur(n){} export const A=1; export type T = string; export { x as y }`
  const e = exportsDe(cod)
  assert.ok(e.includes('eur') && e.includes('A') && e.includes('T') && e.includes('y'))
})

test('rechaza salida vacía', () => {
  assert.equal(validarReescritura(ORIGINAL, '   ').ok, false)
})

test('rechaza el estropicio REAL de qwen (truncó y borró eur())', () => {
  const roto = `// apps/plataforma/lib/dinero.ts\n// (2.`
  const r = validarReescritura(ORIGINAL, roto)
  assert.equal(r.ok, false)
  assert.match(r.motivo || '', /truncamiento|desaparecen/)
})

test('rechaza si desaparece un export existente (aunque la longitud sea similar)', () => {
  const sinEur = ORIGINAL.replace('export function eur', 'function eur') + '\n// relleno para que no sea corto '.repeat(5)
  const r = validarReescritura(ORIGINAL, sinEur)
  assert.equal(r.ok, false)
  assert.match(r.motivo || '', /desaparecen exports/)
})

test('acepta una ADICIÓN correcta que conserva eur() y añade eurSinDecimales()', () => {
  const bueno = ORIGINAL + `
export function eurSinDecimales(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0
  return \`\${v.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' })}€\`
}
`
  assert.equal(validarReescritura(ORIGINAL, bueno).ok, true)
})
