// apps/plataforma/lib/contable/cruce-ventana.test.ts
// Guardián de la VENTANA ANCHA del cruce factura↔movimiento. Lee el FUENTE a propósito: la condición
// vive dentro de un `Prisma.sql`, o sea en una plantilla de texto que ni `tsc` ni `next build` miran.
// Volver a poner ahí un `ABS(...)` compila, arranca y pasa todos los demás tests.
//
// Qué protege (07/09/2026): una factura de gasolina de 40,00€ del 07/09 se ofreció contra un cargo
// del 19/07 —50 días ANTES— y se confirmó de un clic. Un cargo anterior NO puede pagar una factura
// que todavía no existía; el propio comentario del código ya decía «después» mientras el SQL
// aceptaba los dos lados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./documentos.ts', import.meta.url), 'utf8')

test('la ventana ancha (el cargo lejano) se busca SOLO hacia adelante', () => {
  const m = /cargosDelImporte\(cuentaId, f, VENTANA_ANCHA([^)]*)\)/.exec(src)
  assert.ok(m, 'no encuentro la búsqueda del cargo lejano con VENTANA_ANCHA')
  assert.match(m![1], /'posterior'/, 'el cargo lejano se busca con ventana centrada: aceptaría cargos ANTERIORES a la factura')
})

test('la rama «posterior» acota de la fecha de la factura hacia adelante, sin ABS', () => {
  const rama = /ventana === 'posterior'\s*\?\s*Prisma\.sql`([^`]*)`/.exec(src)
  assert.ok(rama, 'no encuentro la rama SQL de la ventana posterior')
  assert.match(rama![1], /BETWEEN\s+\$\{f\.fecha\}::date\s+AND/, 'la ventana posterior no arranca en la fecha de la factura')
  assert.doesNotMatch(rama![1], /ABS\(/, 'un ABS en la ventana posterior la vuelve simétrica otra vez')
})

test('varios cargos libres del mismo importe NO se colapsan en una propuesta', () => {
  assert.match(src, /posteriores\.length > 1/, 'no se cuenta si hay más de un candidato del mismo importe')
  assert.match(src, /estado: 'varios_candidatos'/, 'no se emite el desenlace de candidatos ambiguos')
})
