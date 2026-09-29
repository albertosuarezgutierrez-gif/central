import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 29/09/2026 (Alberto): el historial se declara al máximo y, si el vendor rechaza un valor, el
// tope se aprende y se ajusta solo. Dos invariantes que valen dinero:
// - solo se reintenta tras un 400 de VALIDACIÓN (no se cobra); nunca tras un precio ya pagado;
// - UNA vez: el reintento lleva `reintentoTopes` y no vuelve a reintentar (sin bucle de cargos).
const fuente = readFileSync(join(import.meta.dirname, '..', 'apps/asegura/lib/codeoscopic/cotizar.ts'), 'utf8')

test('el reintento por topes es solo tras un 400 de validación y una sola vez', () => {
  assert.match(fuente, /if \(e\.clase === 'validacion' && topes && !p\.reintentoTopes\) \{/)
  assert.match(fuente, /cotizar\(\{ \.\.\.p, cuerpo: r2\.cuerpo, reintentoTopes: true \}, env, deps\)/)
})

test('los topes aprendidos se aplican ANTES de reservar y llamar', () => {
  const i = fuente.indexOf('aplicarTopesHistorial(p.cuerpo, await topes.leer())')
  assert.ok(i > 0 && i < fuente.indexOf('// 5 — Reserva ANTES de llamar'))
})
