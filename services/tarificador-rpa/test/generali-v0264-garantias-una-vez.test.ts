// Generali auto v0.2.64: «Garantías y Resultados» se pulsa UNA vez por trabajo (el guard no permite más); el bloque ya a la vista no pide clic.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { asegurarGarantiasYResultadosGenerali, ErrorMapaIncompletoGenerali, GARANTIAS_PULSADA_GENERALI, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

let browser: Browser
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
})
after(async () => { await browser?.close() })

const BLOQUE = '<div id="reg1063E_verifRiesgo_zvriepIdentification">Verificación</div>'
async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    return await fn(page)
  } finally { await context.close() }
}
const ctxCon = (cuenta: { n: number }) => ({ pulsarSubpestanaGenerali: async () => { cuenta.n++ } }) as unknown as ContextoPortal

test('v0.2.64 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.65'))

test('bloque ya a la vista: no se pulsa la subpestaña', async () => {
  const c = { n: 0 }
  await conPagina(BLOQUE, (p) => asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2))
  assert.equal(c.n, 0)
})

test('ya pulsada en el trabajo y bloque ausente: error claro, sin segundo clic', async () => {
  const c = { n: 0 }
  await conPagina('<p>otra pantalla</p>', async (p) => {
    GARANTIAS_PULSADA_GENERALI.add(p)
    await assert.rejects(asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2), (e) => e instanceof ErrorMapaIncompletoGenerali && /Verificación del riesgo/.test(String(e.message)))
  })
  assert.equal(c.n, 0)
})

test('sin pulsar antes y bloque ausente: una sola pulsación, y la segunda llamada ya no pulsa', async () => {
  const c = { n: 0 }
  await conPagina('<p>otra pantalla</p>', async (p) => {
    await assert.rejects(asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2), ErrorMapaIncompletoGenerali)
    await assert.rejects(asegurarGarantiasYResultadosGenerali(p, ctxCon(c), 10, 2), ErrorMapaIncompletoGenerali)
  })
  assert.equal(c.n, 1)
})
