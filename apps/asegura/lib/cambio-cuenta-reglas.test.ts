import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { revisarIbanNuevo, textoHistorialCuentaFicha } from './cambio-cuenta-reglas.ts'

// IBAN de ejemplo con dígitos de control válidos (no es de nadie).
const VALIDO = 'ES91 2100 0418 4502 0005 1332'

test('un IBAN válido se normaliza y solo sale su máscara para enseñar', () => {
  const r = revisarIbanNuevo(VALIDO, null)
  assert.deepEqual(r, { ok: true, iban: 'ES9121000418450200051332', mascara: '**** 1332' })
})

test('🪤 dígitos de control mal, basura o demasiado largo: no se acepta', () => {
  assert.equal(revisarIbanNuevo('ES9221000418450200051332', null).ok, false)
  assert.equal(revisarIbanNuevo('hola', null).ok, false)
  assert.equal(revisarIbanNuevo(123, null).ok, false)
  assert.equal(revisarIbanNuevo(`${VALIDO}0000000000000`, null).ok, false)
})

test('la misma cuenta que ya tiene no es un cambio', () => {
  assert.deepEqual(revisarIbanNuevo(VALIDO, 'ES9121000418450200051332'), { ok: false, estado: 'sin_cambios' })
})

// ─── La cuenta de la FICHA puesta por el corredor (29/09/2026) ──────────────────────────────────
test('historial de la cuenta de la ficha: solo máscaras, dice el antes y que no toca las pólizas', () => {
  const t = textoHistorialCuentaFicha({ mascara: '**** 0115', antes: null, antesIlegible: false, actor: 'alberto@x' })
  assert.match(t, /\*\*\*\* 0115/)
  assert.match(t, /antes: sin cuenta/)
  assert.match(t, /no cambia la cuenta de sus pólizas/)
  assert.match(textoHistorialCuentaFicha({ mascara: '**** 0115', antes: null, antesIlegible: true, actor: 'a' }), /cifrada que no se podía leer/)
  assert.match(textoHistorialCuentaFicha({ mascara: '**** 0115', antes: '**** 9999', antesIlegible: false, actor: 'a' }), /antes: \*\*\*\* 9999/)
})

test('ponerCuentaFicha: cifra el IBAN, escribe solo la ficha (no las pólizas) y el historial sale de la regla con máscaras', () => {
  const fuente = readFileSync(fileURLToPath(new URL('./cambio-cuenta.ts', import.meta.url)), 'utf8')
  const f = fuente.slice(fuente.indexOf('export async function ponerCuentaFicha'))
  assert.ok(f.length > 100, 'ponerCuentaFicha existe')
  assert.match(f, /cuenta_bancaria = \$\{encryptField\(revision\.iban\)\}/)
  assert.doesNotMatch(f, /update polizas/i)
  assert.match(f, /textoHistorialCuentaFicha\(\{ mascara: revision\.mascara/)
  // El IBAN en claro solo va a encryptField: ni en el historial ni en lo que se devuelve.
  assert.equal((f.match(/revision\.iban/g) ?? []).length, 1)
  assert.match(f, /merged_into_cliente_id is null[\s\S]*for update/)
})
