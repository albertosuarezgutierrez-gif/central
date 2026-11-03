// Generali auto v0.2.54 / humo 0.3.2 (31/10/2026, humo real 1f53b8c0): «diag: pág CorredorPortal.po; 12 marco(s): CorredorPortal.po[CERRAR
// visible] · …». En el DOM las pestañas van como «Negocio»/«Compañía» (el CSS las pinta en mayúsculas); el humo buscaba «NEGOCIO» distinguiendo
// mayúsculas, mientras la puerta del guard que sí entra en la tarificación (`unicoPorTextoGenerali`) no distingue. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { exigirMenuNegocioGenerali } from '../src/adapters/generali/auto.ts'
import { patronPestanaMenuGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorTarificador } from '../src/errores.ts'

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

const PORTAL = 'https://www.generali.es/mediadores/CorredorPortal.po'

async function conPortal(html: string, fn: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    await context.route('**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }))
    const page = await context.newPage()
    await page.goto(PORTAL)
    await fn(page)
  } finally {
    await context.close()
  }
}

const menu = (negocio: string) => `<html><body><ul style="text-transform:uppercase"><li><a style="display:none">${negocio}</a></li><li><a>Compañía</a></li><li><a>CERRAR</a></li></ul></body></html>`

test('v0.2.54 «Negocio» en el DOM (CSS en mayúsculas, plegado) → el humo pasa; el diag cuenta «Compañía» como COMPAÑÍA', async () => {
  await conPortal(menu('Negocio'), async (page) => {
    await exigirMenuNegocioGenerali(page, { esperaMs: 1_000, pausaMs: 100 })
  })
})

test('v0.2.54 sigue siendo rótulo ENTERO: «Mi negocio» no es el menú → falla con diag', async () => {
  await conPortal(menu('Mi negocio'), async (page) => {
    const e = await exigirMenuNegocioGenerali(page, { esperaMs: 300, pausaMs: 100 }).then(() => null, (x: unknown) => x)
    assert.ok(e instanceof ErrorTarificador)
    assert.match(e.message, /CorredorPortal\.po\[COMPAÑÍA visible, CERRAR visible\]/)
  })
  assert.ok(patronPestanaMenuGenerali('NEGOCIO').test(' Negocio '))
  assert.ok(!patronPestanaMenuGenerali('NEGOCIO').test('NEGOCIO ONLINE'))
})
