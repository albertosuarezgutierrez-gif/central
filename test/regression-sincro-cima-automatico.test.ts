// Ficha ↔ CIMA, reglas del 26/09/2026 (Alberto sobre el panel de diferencias):
// el teléfono nuevo (y el email, 28/09/2026) se AÑADE solo salvo que ya esté en otra ficha, y lo
// automático no se fuerza. Cepo de fuente: `lib/sincro-cima.ts` importa Prisma
// y no se puede cargar sin el cliente generado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../apps/asegura/lib/sincro-cima.ts', import.meta.url), 'utf8')

test('un teléfono o email de CIMA que ya está en OTRA ficha pregunta (discrepa + aviso), no se copia solo', () => {
  assert.match(src, /if \(\(d\.campo !== 'telefono' && d\.campo !== 'email'\) \|\| \(d\.accion !== 'anadir' && d\.accion !== 'rellenar'\)\) continue/)
  assert.match(src, /coincidencias\(correduriaId, \{ \[d\.campo\]: d\.cima \}, a\.c\.id\)/)
  assert.match(src, /d\.accion = 'discrepa'\s*\n\s*d\.aviso =/)
  assert.match(src, /await avisarContactosCompartidos\(correduriaId, lista\)/)
})

test('lo automático entra como secundario y SIN forzar; solo «Usar CIMA» fuerza', () => {
  assert.match(src, /principal: d\.accion !== 'anadir'/)
  assert.match(src, /forzar: d\.accion === 'discrepa'/)
})

test('el cron aplica rellenar + anadir + completar + formatear + corregir, y el volcado en bloque no fuerza lo que lleva aviso', () => {
  assert.match(src, /const AUTOMATICAS: readonly DiferenciaCima\['accion'\]\[\] = \['rellenar', 'anadir', 'completar', 'formatear', 'corregir'\]/)
  assert.match(src, /if \(d\.aviso\) \{ fallidos\.push/)
})

test('el nombre se escribe siempre en «Nombre Propio»', () => {
  assert.match(src, /nombre: nombrePropio\(p\.nombre\)/)
})
