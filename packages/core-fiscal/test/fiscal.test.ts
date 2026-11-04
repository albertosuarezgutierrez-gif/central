// Tests de la lógica PURA de @central/core-fiscal (IVA, validación, XML).
// Se ejecutan con el runner de Node (type-stripping): `node --test`.
// Importan los ficheros src con extensión .ts explícita (lo exige el strip-types de Node).
//
// Núcleo de máximo riesgo: un fallo aquí es fiscal/legal (cuotas de IVA mal,
// huella VeriFactu rota → la cadena de facturas deja de ser válida ante AEAT).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calcularFiscal } from '../src/iva.ts'
import { escapeXml } from '../src/xml.ts'
import { validarNifCif, validarIban } from '../src/validacion.ts'

// ── IVA ─────────────────────────────────────────────────────────────────────
test('calcularFiscal: descompone con IVA 21% (121 → base 100, cuota 21)', () => {
  assert.deepEqual(calcularFiscal(121, 21), { base_imponible: 100, cuota_iva: 21, tipo_iva: 21 })
})

test('calcularFiscal: tipo por defecto 10% (110 → base 100, cuota 10)', () => {
  assert.deepEqual(calcularFiscal(110), { base_imponible: 100, cuota_iva: 10, tipo_iva: 10 })
})

test('calcularFiscal: base + cuota == importe con IVA (redondeo a 2 decimales)', () => {
  const r = calcularFiscal(99.99, 21)
  assert.equal(Math.round((r.base_imponible + r.cuota_iva) * 100) / 100, 99.99)
})

// ── Validación NIF/NIE/CIF ──────────────────────────────────────────────────
test('validarNifCif: vacío = ok (campo opcional, no se valida)', () => {
  assert.deepEqual(validarNifCif(''), { ok: true })
  assert.deepEqual(validarNifCif(null), { ok: true })
})

test('validarNifCif: NIF válido (12345678Z) y letra incorrecta (12345678A)', () => {
  assert.equal(validarNifCif('12345678Z').ok, true)
  assert.equal(validarNifCif('12345678A').ok, false)
})

test('validarNifCif: acepta minúsculas, espacios y guiones', () => {
  assert.equal(validarNifCif('12345678-z').ok, true)
  assert.equal(validarNifCif(' 12345678 Z ').ok, true)
})

test('validarNifCif: NIE válido (X/Y/Z)', () => {
  // X1234567L: prefijo X→0 → 01234567 % 23 = 14 → 'L'
  assert.equal(validarNifCif('X1234567L').ok, true)
})

test('validarNifCif: formato no reconocido → no válido', () => {
  assert.equal(validarNifCif('hola').ok, false)
})

// ── Validación IBAN ─────────────────────────────────────────────────────────
test('validarIban: IBAN español válido y checksum incorrecto', () => {
  assert.equal(validarIban('ES9121000418450200051332').ok, true)
  // mismo IBAN con un dígito alterado → falla el mod-97
  assert.equal(validarIban('ES9121000418450200051333').ok, false)
})

test('validarIban: formato no válido y vacío', () => {
  assert.equal(validarIban('ES0000').ok, false)
  assert.equal(validarIban('').ok, true)
})

// ── XML ─────────────────────────────────────────────────────────────────────
test('escapeXml: escapa los 5 caracteres especiales', () => {
  assert.equal(escapeXml(`<a b="c" d='e' & f>`), '&lt;a b=&quot;c&quot; d=&apos;e&apos; &amp; f&gt;')
})

// AEAT / VeriFactu: ver test/verifactu.test.ts (vectores oficiales de la AEAT).
