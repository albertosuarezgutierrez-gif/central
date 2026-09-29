import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cuentaParaComparar, presupuestoFirmadoEnOtraCuenta, revisarIbanNuevo, textoHistorialCuentaFicha } from './cambio-cuenta-reglas.ts'

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
  // Un presupuesto firmado con cuenta nueva se mira ANTES de escribir la ficha.
  const firmado = f.indexOf('presupuestoFirmadoEnOtraCuenta(')
  assert.ok(firmado > 0 && firmado < f.indexOf('update clientes set cuenta_bancaria'), 'el presupuesto firmado se comprueba antes del update')
  // Lo que se compara y lo que va al historial nunca es el cifrado sin abrir.
  assert.match(f, /startsWith\('v1:'\) \? null/)
})

// ─── «Ya es tu cuenta» del portal: la ficha puede llevar otra cuenta que sus pólizas ─────────────
test('cuentaParaComparar: la de la ficha vale solo si TODAS las pólizas vigentes la comparten', () => {
  const A = 'ES9121000418450200051332'
  const B = 'ES1401826836840201540115'
  assert.equal(cuentaParaComparar(A, [A, A]), A)
  assert.equal(cuentaParaComparar(A, []), A, 'sin pólizas vigentes, la de la ficha es la única que hay')
  assert.equal(cuentaParaComparar(A, [A, B]), null, 'una póliza paga de otra: pedir A sí es un cambio')
  assert.equal(cuentaParaComparar(A, [A, null]), null, 'una póliza sin cuenta que conste no coincide')
  assert.equal(cuentaParaComparar(null, [A]), null)
  assert.equal(cuentaParaComparar('ES91 2100 0418 4502 0005 1332', [A]), 'ES91 2100 0418 4502 0005 1332', 'espacios no son otra cuenta')
})

test('solicitarCambioCuenta (portal) compara contra cuentaParaComparar, no contra la ficha a pelo', () => {
  const fuente = readFileSync(fileURLToPath(new URL('./cambio-cuenta.ts', import.meta.url)), 'utf8')
  const f = fuente.slice(fuente.indexOf('export async function solicitarCambioCuenta'), fuente.indexOf('await db.$transaction'))
  assert.match(f, /revisarIbanNuevo\(ibanBruto, cuentaParaComparar\(/)
})

test('presupuestoFirmadoEnOtraCuenta: solo bloquea si lo firmado es OTRA cuenta', () => {
  assert.equal(presupuestoFirmadoEnOtraCuenta([], '**** 0115'), null)
  assert.equal(presupuestoFirmadoEnOtraCuenta(['**** 0115'], '**** 0115'), null, 'poner la misma que firmó no pisa nada')
  assert.equal(presupuestoFirmadoEnOtraCuenta(['**** 0115', '**** 1332'], '**** 0115'), '**** 1332')
  assert.equal(presupuestoFirmadoEnOtraCuenta([null], '**** 0115'), 'una cuenta que no consta', 'sin máscara no se afirma que coincide')
})
