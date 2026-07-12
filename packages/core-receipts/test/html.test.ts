import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderInvoiceHtml, FiscalIntegrityError } from '../src/index.ts'
import { DOC, BRAND_DEFAULT, BRAND_SIQUE } from './html-fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const goldenPath = join(here, 'fixtures', 'invoice-default.html')

test('snapshot: HTML con branding default estable', () => {
  const html = renderInvoiceHtml(DOC, BRAND_DEFAULT)
  if (!existsSync(goldenPath)) { writeFileSync(goldenPath, html); console.log('golden creado'); return }
  assert.equal(html, readFileSync(goldenPath, 'utf8'))
})

test('campos fiscales aparecen verbatim', () => {
  const html = renderInvoiceHtml(DOC, BRAND_DEFAULT)
  for (const v of ['F-2026-000123', 'B00000000', '100,00', '21,00', '121,00']) {
    assert.ok(html.includes(v), `falta ${v}`)
  }
})

test('branding inyecta sus colores como CSS vars', () => {
  const html = renderInvoiceHtml(DOC, BRAND_SIQUE)
  assert.ok(html.includes('--brand-primary:#0a0805'))
  assert.ok(html.includes('--brand-light:#fff8e1'))
  assert.ok(html.includes('Sique Brilla'))
})

test('escapa HTML en campos de texto (anti-XSS)', () => {
  const evil = { ...DOC, lineas: [{ descripcion: '<script>alert(1)</script>', cantidad: 1, precioUnitario: 1 }],
    fiscal: { ...DOC.fiscal, base: 1, iva: 0, total: 1 } }
  const html = renderInvoiceHtml(evil, BRAND_DEFAULT)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;'))
})

test('falla cerrado si un campo fiscal no aparece verbatim en lo renderizado', () => {
  // Un número de factura con caracteres que se escapan en HTML no aparece literal → FiscalIntegrityError.
  // (Antes se forzaba con total 999999, pero ahora formatFiscalNumber agrupa igual que eur() y sí aparece.)
  const bad = { ...DOC, fiscal: { ...DOC.fiscal, numero: 'F-2026-<0001>' } }
  assert.throws(() => renderInvoiceHtml(bad, BRAND_DEFAULT), FiscalIntegrityError)
})

test('no lanza con importes ≥ 1000 (regresión M20: miles agrupados cuadran con eur())', () => {
  const grande = { ...DOC, fiscal: { ...DOC.fiscal, base: 1000, iva: 210, total: 1210 } }
  let html = ''
  assert.doesNotThrow(() => { html = renderInvoiceHtml(grande, BRAND_DEFAULT) })
  assert.ok(html.includes('1.000,00'), 'la base agrupada debe aparecer')
  assert.ok(html.includes('1.210,00'), 'el total agrupado debe aparecer')
})
