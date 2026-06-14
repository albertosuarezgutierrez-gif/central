// Tests de la lógica PURA de @central/core-fiscal (IVA, validación, AEAT/VeriFactu).
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
import { calcularHuella, parseFechaLocalAEAT, generarQrData } from '../src/es/aeat.ts'
import type { RegistroFactura } from '../src/es/aeat.ts'

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

// ── AEAT / VeriFactu ────────────────────────────────────────────────────────
test('parseFechaLocalAEAT: ISO con offset → fecha LOCAL dd-mm-yyyy hh:mm:ss (no UTC)', () => {
  // CRÍTICO: 20:14 local debe quedar 20:14, no convertirse a UTC (18:14).
  assert.equal(parseFechaLocalAEAT('2026-05-02T20:14:33+02:00'), '02-05-2026 20:14:33')
})

const REG: RegistroFactura = {
  nif_emisor: 'B12345678',
  numero_serie: 'FA',
  numero_factura: 42,
  fecha_expedicion: '2026-05-02T20:14:33+02:00',
  importe_total: 121,
  cuota_iva: 21,
  huella_anterior: null,
}

test('calcularHuella: SHA-256 de 64 hex en MAYÚSCULAS y determinista', () => {
  const h = calcularHuella(REG)
  assert.match(h, /^[0-9A-F]{64}$/)
  assert.equal(calcularHuella(REG), h) // mismo input → misma huella
})

test('calcularHuella: snapshot de regresión (la cadena AEAT no debe cambiar sin querer)', () => {
  // Si este valor cambia, alguien alteró el orden/formato de los campos de la
  // huella → rompería la validez VeriFactu de TODA la cadena de facturas.
  assert.equal(
    calcularHuella(REG),
    '965A9A6C6D88CE7729616AD51BC1D21F0B5AA9F5A229ADDEC00B598523EDFEFF',
  )
})

test('calcularHuella: encadenar (huella_anterior distinta) cambia la huella', () => {
  const h1 = calcularHuella(REG)
  const h2 = calcularHuella({ ...REG, huella_anterior: h1 })
  assert.notEqual(h1, h2)
})

test('generarQrData: URL TIKE-CONT con número a 8 dígitos e importe con 2 decimales', () => {
  const url = generarQrData({ nif: 'B12345678', serie: 'FA', numero: 42, fecha: '2026-05-02', importe: 121 })
  assert.ok(url.startsWith('https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT?'))
  assert.match(url, /nfac=00000042/)
  assert.match(url, /importe=121\.00/)
})
