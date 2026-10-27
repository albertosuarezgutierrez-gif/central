// Generali Turismos v0.2.41 (27/10/2026, prueba real con 0.2.40): la puerta de «Recalcular» bloqueaba por «contratar» en el rótulo informativo «Forma de pago a contratar». Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { casaEmisionGenerali, instalarGuardEmision, pulsarRecalcularGenerali, sinRotulosInformativosGenerali } from '../src/guard.ts'

test('v0.2.41 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(4[1-9]|[5-9]\d)$/)
})

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


const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'
const ROTULO = '<span>\n  Forma de pago a contratar\n</span><span> * </span><select><option>Anual</option></select>'
const MENU = `<ul id="men"><li><a class="NOLINK titulo">Acciones</a><ul id="sub"><li id="rec" onclick="parent.__rec=(parent.__rec||0)+1;return false"><a class="btn">Recalcular</a></li><li id="gua" onclick="parent.__gua=(parent.__gua||0)+1;return false"><a class="btn">Guardar Cálculo</a></li></ul></li></ul>`

/** Monta la pantalla en el marco B028 y lanza la puerta; devuelve { error, rec, gua }. */
async function lanzar(extra: string): Promise<{ error: unknown; rec: number; gua: number }> {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    await context.route('https://www.generali.es/**', async (r) => {
      const cuerpo = r.request().url().startsWith(PORTAL) ? `<iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>` : `<h3>Garantías y Resultados</h3>${extra}${MENU}`
      await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.goto(PORTAL)
    for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(B028) && f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
    await page.frames().find((f) => f.name() === 'mainFrame')!.locator('body').waitFor()
    let error: unknown = null
    try { await pulsarRecalcularGenerali(page, guard) } catch (e) { error = e }
    const cuenta = (k: string) => page.evaluate((c) => (window as unknown as Record<string, number>)[c] ?? 0, k)
    return { error, rec: await cuenta('__rec'), gua: await cuenta('__gua') }
  } finally {
    await context.close()
  }
}

test('v0.2.41 · puro: solo la frase exacta se excusa; el resto de «contratar» sigue casando', () => {
  assert.equal(casaEmisionGenerali(sinRotulosInformativosGenerali('Forma de pago a contratar *')), null)
  assert.equal(casaEmisionGenerali(sinRotulosInformativosGenerali('FORMA  DE PAGO\nA CONTRATAR')), null)
  assert.notEqual(casaEmisionGenerali(sinRotulosInformativosGenerali('Contratar')), null)
  assert.notEqual(casaEmisionGenerali(sinRotulosInformativosGenerali('¿Desea contratar esta póliza?')), null)
  assert.notEqual(casaEmisionGenerali(sinRotulosInformativosGenerali('Forma de pago a contratar. Pulse para contratar ahora')), null)
  assert.equal(sinRotulosInformativosGenerali('Forma de pago a contratarla'), 'Forma de pago a contratarla')
  assert.notEqual(casaEmisionGenerali(sinRotulosInformativosGenerali('Emitir póliza')), null)
})

test('v0.2.41 · puerta: con el rótulo «Forma de pago a contratar» en la página pulsa «Recalcular» (y nunca «Guardar Cálculo»)', async () => {
  const r = await lanzar(ROTULO)
  assert.equal(r.error, null)
  assert.equal(r.rec, 1)
  assert.equal(r.gua, 0)
})

test('v0.2.41 · puerta: un botón o enlace «Contratar» junto al rótulo sigue bloqueando', async () => {
  for (const extra of ['<button>Contratar</button>', '<a href="#">Contratar</a>']) {
    const r = await lanzar(ROTULO + extra)
    assert.ok(r.error instanceof EmisionBloqueadaError, String(r.error))
    assert.equal(r.rec, 0)
  }
})

test('v0.2.41 · puerta: un diálogo «¿Desea contratar…?» junto al rótulo sigue bloqueando', async () => {
  const r = await lanzar(ROTULO + '<div role="dialog"><p>¿Desea contratar esta modalidad?</p></div>')
  assert.ok(r.error instanceof EmisionBloqueadaError, String(r.error))
  assert.equal(r.rec, 0)
})
