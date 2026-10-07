// Lector de primas de Allianz «RC PYME»: fixture SINTÉTICA (HTML inventado, valores ficticios; no es HTML real del portal).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { allianzRcPyme, ErrorMapaIncompleto, leerPrimasTarifa, N_INPUTS_TARIFA, primasDesdeValores } from '../src/adapters/allianz/rc-pyme.ts'
import { ErrorTarificador } from '../src/errores.ts'

/** 27 valores: neta 0-5, impuestos 6-11, total 12-17, (18-23 relleno), única 24-26. Anual = 1.000,00 + 60,00 = 1.060,00. */
function valores(sobre: Record<number, string> = {}): string[] {
  const base = ['1.000,00', '510,00', '260,00', '', '', '', '60,00', '30,60', '15,60', '', '', '', '1.060,00', '540,60', '275,60', '', '', '', '', '', '', '', '', '', '1.060,00', '', '']
  return base.map((v, i) => sobre[i] ?? v)
}
const inputs = (v: string[]) => v.map((x) => `<input type="text" readonly value="${x}">`).join('\n')
const html = (v: string[], extra = '') =>
  `<body><form id="otro"><input readonly value="9.999,99"></form><form id="tarifaViewForm"><input type="hidden" value="777,00"><table><tr><td>${inputs(v)}</td></tr></table><input type="text" value="888,00"></form>${extra}</body>`

test('primasDesdeValores: neta, impuestos y total anual (formato español)', () => {
  assert.deepEqual(primasDesdeValores(valores()), { primaNetaAnualEur: 1000, impuestosAnualEur: 60, primaTotalAnualEur: 1060 })
})
test('primasDesdeValores: importes sin miles ni decimales', () => {
  const p = primasDesdeValores(valores({ 0: '250', 6: '15,5', 12: '265,5 €' }))
  assert.deepEqual(p, { primaNetaAnualEur: 250, impuestosAnualEur: 15.5, primaTotalAnualEur: 265.5 })
})
for (const [nombre, v] of [
  ['importe ilegible', valores({ 0: 'n/d' })],
  ['impuestos vacío', valores({ 6: '' })],
  ['no cuadra', valores({ 12: '1.070,00' })],
  ['faltan inputs', valores().slice(0, 20)],
  ['sobran inputs', [...valores(), '1,00']],
] as const) {
  test(`primasDesdeValores falla cerrado: ${nombre}`, () => {
    assert.throws(() => primasDesdeValores(v), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  })
}
test(`la pantalla trae ${N_INPUTS_TARIFA} inputs`, () => assert.equal(valores().length, N_INPUTS_TARIFA))

let browser: Browser
let page: Page
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(3_000)
})
after(async () => {
  await browser?.close()
})

test('leerPrimasTarifa: inputs SIN id, ignora ocultos, editables y otros formularios', async () => {
  await page.setContent(html(valores()))
  assert.deepEqual(await leerPrimasTarifa(page), { primaNetaAnualEur: 1000, impuestosAnualEur: 60, primaTotalAnualEur: 1060 })
})
test('leerPrimasTarifa: sin #tarifaViewForm falla cerrado', async () => {
  await page.setContent('<body><input readonly value="1,00"></body>')
  await assert.rejects(leerPrimasTarifa(page), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
})

test('el flujo declara el hueco «Datos básicos» con error tipado (no transitorio)', async () => {
  const ctx = {
    sesionReutilizada: true,
    log: () => {},
    pausa: async () => {},
    trasLogin: async () => {},
    exigirSinCaptcha: async () => {},
    pulsar: async () => {},
  }
  // Sin portal real: se prueba el error del paso directamente.
  const { rellenarDatosBasicos } = await import('../src/adapters/allianz/rc-pyme.ts')
  await assert.rejects(
    rellenarDatosBasicos(page, {} as never, ctx as never),
    (e) => e instanceof ErrorMapaIncompleto && /mapa incompleto: faltan Datos básicos/.test(e.message) && e.transitorio === false,
  )
  assert.equal(allianzRcPyme.ramo, 'rc_pyme')
})
