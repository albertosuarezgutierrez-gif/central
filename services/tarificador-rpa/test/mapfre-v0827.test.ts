// Mapfre auto v0.8.27 (27/10/2026): con UN solo mat-select «Compañia» habilitado pero dentro de un acordeón PLEGADO (contenido con visibility:hidden) el
// respaldo lo descartaba por «no visible» y el trabajo acababa en hueco. Ahora se despliega la cabecera por `pulsar` y se rellena. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { Locator } from 'playwright'
import { mapfreAuto, rellenarMatSelects, selectCompaniaPorEtiqueta, SEL_HISTORIAL } from '../src/adapters/mapfre/auto.ts'

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
after(async () => {
  await browser?.close()
})
async function pagina(html: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return page
}
const PANEL = `<body><app-figuras><mat-expansion-panel id="p"><mat-expansion-panel-header id="cab">Historial</mat-expansion-panel-header>
<div id="cont" style="visibility:hidden;height:0;overflow:hidden"><mat-form-field><label><mat-label>Compañia</mat-label></label>
<mat-select formcontrolname="compania" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select></mat-form-field></div></mat-expansion-panel>
<mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field></app-figuras></body>`
// Simula el guard: pulsar despliega el panel (la cabecera del acordeón).
const desplegar = (page: Page) => async (b: Locator) => {
  await b.evaluate(() => { const c = document.getElementById('cont')!; c.style.visibility = 'visible'; c.style.height = 'auto'; document.getElementById('p')!.classList.add('mat-expanded') })
}

test('v0.8.27 · la versión del bot es 0.8.28', () => assert.equal(mapfreAuto.version, '0.8.40'))

test('único habilitado en acordeón plegado: sin pulsar → null; con pulsar → se despliega y se devuelve', async () => {
  const sin = await pagina(PANEL)
  assert.equal(await selectCompaniaPorEtiqueta(sin), null)
  const page = await pagina(PANEL)
  let pulsaciones = 0
  const pulsar = async (b: Locator) => { pulsaciones++; await desplegar(page)(b) }
  const loc = await selectCompaniaPorEtiqueta(page, pulsar)
  assert.equal(pulsaciones, 1)
  assert.ok(loc)
  assert.equal(await loc.getAttribute('formcontrolname'), 'compania')
})

test('oculto SIN acordeón que desplegar → null y no se pulsa nada', async () => {
  const oculto = `<body><mat-form-field><label><mat-label>Compañia</mat-label></label><mat-select formcontrolname="compania" style="display:none"><span>x</span></mat-select></mat-form-field></body>`
  let n = 0
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(oculto), async () => { n++ }), null)
  assert.equal(n, 0)
})

test('rellenarMatSelects: compañía anterior con panel plegado se elige con la misma capa común (opciones del riesgo), tras desplegar por pulsar', async () => {
  const page = await pagina(PANEL)
  const elegidas: string[][] = []
  const plan = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never
  const hechos = await rellenarMatSelects(page, plan, { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o) }, pulsar: desplegar(page) } as never, { page, formador: undefined } as never, 0)
  assert.deepEqual(hechos, ['compañía anterior'])
  assert.deepEqual(elegidas, [['ZZ Seguros']])
})

test('rellenarMatSelects: sin pulsar disponible el hueco de siempre', async () => {
  const page = await pagina(PANEL)
  const plan = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never
  await assert.rejects(rellenarMatSelects(page, plan, { elegirMatSelect: async () => undefined } as never, { page, formador: undefined } as never, 0), /no aparece/)
})
