// Ficha ↔ CIMA, reglas del 26/09/2026 (Alberto sobre el panel de diferencias):
// el teléfono nuevo se AÑADE solo salvo que ya esté en otra ficha, y lo
// automático no se fuerza. Cepo de fuente: `lib/sincro-cima.ts` importa Prisma
// y no se puede cargar sin el cliente generado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../apps/asegura/lib/sincro-cima.ts', import.meta.url), 'utf8')

test('un teléfono de CIMA que ya está en OTRA ficha pregunta (discrepa + aviso), no se copia solo', () => {
  assert.match(src, /coincidencias\(correduriaId, \{ telefono: d\.cima \}, a\.c\.id\)/)
  assert.match(src, /d\.accion = 'discrepa'\s*\n\s*d\.aviso =/)
  assert.match(src, /await avisarTelefonosCompartidos\(correduriaId, lista\)/)
})

test('lo automático entra como secundario y SIN forzar; solo «Usar CIMA» fuerza', () => {
  assert.match(src, /principal: d\.accion !== 'anadir'/)
  assert.match(src, /forzar: d\.accion === 'discrepa'/)
})

test('el cron aplica rellenar + anadir + formatear, y el volcado en bloque no fuerza lo que lleva aviso', () => {
  assert.match(src, /const AUTOMATICAS: readonly DiferenciaCima\['accion'\]\[\] = \['rellenar', 'anadir', 'formatear'\]/)
  assert.match(src, /if \(d\.aviso\) \{ fallidos\.push/)
})

test('el nombre se escribe siempre en «Nombre Propio»', () => {
  assert.match(src, /nombre: nombrePropio\(p\.nombre\)/)
})
