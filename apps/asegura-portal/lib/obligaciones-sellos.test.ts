// Cepo de cableado (14/10/2026): la obligación de CARTERA suelta los sellos de un ciclo anterior.
// Sin esto, el año 2 de cada póliza ni correo ni push (el upsert cambiaba la fecha y dejaba el sello).
// La regla es `sellosAReiniciar` de `@central/module-seguros-portal` (con su test puro).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(import.meta.dirname, 'obligaciones.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

test('🚨 el upsert de la obligación de cartera aplica sellosAReiniciar con la fila previa', () => {
  const i = src.indexOf("where: { identidadId_polizaId_tipo: { identidadId, polizaId: p.id, tipo: 'poliza' } }")
  assert.ok(i !== -1, 'no encuentro el upsert de cartera')
  const update = src.slice(src.indexOf('update:', i), src.indexOf('ops.push(', i))
  assert.match(update, /\.\.\.sellosAReiniciar\(previas\.get\(p\.id\), accionable\)/, 'el update ya no suelta los sellos viejos')
})

test('🚨 declaradas: la lectura previa de «poliza» va acotada por identidad y trae los dos sellos', () => {
  assert.match(src, /findMany\(\{\s*where: \{ identidadId, tipo: 'poliza', polizaDeclaradaId: \{ not: null \} \},\s*select: \{ polizaDeclaradaId: true, avisadaAt: true, avisadaPushAt: true \}/)
})

test('🚨 la lectura previa va acotada por identidad, solo a las de cartera, y trae los dos sellos', () => {
  assert.match(src, /findMany\(\{\s*where: \{ identidadId, tipo: 'poliza', polizaId: \{ not: null \} \},\s*select: \{ polizaId: true, avisadaAt: true, avisadaPushAt: true \}/)
})
