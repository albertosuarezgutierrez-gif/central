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

test('falla cerrado si el total no cuadra con lo renderizado', () => {
  // total imposible de formatear en la salida (no aparece) → FiscalIntegrityError
  const bad = { ...DOC, fiscal: { ...DOC.fiscal, total: 999999 } }
  assert.throws(() => renderInvoiceHtml(bad, BRAND_DEFAULT), FiscalIntegrityError)
})
