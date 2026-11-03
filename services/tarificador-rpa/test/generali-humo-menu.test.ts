// Humo de Generali v0.3.1 (30/10/2026): el humo nocturno fallaba TODAS las noches desde el 20/10 con «el menú «NEGOCIO» no está
// visible tras elegir el mediador» porque exigía `visible` y en CorredorPortal.po NEGOCIO es un `<a>` sin href que puede estar plegado
// (prueba real 31e76085; la tarificación ya lo aceptaba «en el DOM»). Ahora el humo usa el MISMO criterio y, si falta, deja una
// línea «diag:» saneada (rutas sin query, solo el estado de las pestañas conocidas, nunca textos libres de la cabecera).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { exigirMenuNegocioGenerali } from '../src/adapters/generali/auto.ts'
import { diagMenuNegocioGenerali } from '../src/adapters/generali/reglas.ts'
import { mensajeFalloHumo } from '../src/humo.ts'
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

const NOMBRE = 'PEPITO DEMO FICTICIO'
const PORTAL = 'https://www.generali.es/mediadores/CorredorPortal.po'
const cabecera = `<div>Portal del Corredor ${NOMBRE} | 99999</div>`
// El menú real: `<a>` SIN href, plegado (oculto) hasta el sobrevuelo; COMPAÑÍA y CERRAR sí se ven.
const MENU_PLEGADO = `<ul><li><a style="display:none">NEGOCIO</a></li><li><a>COMPAÑÍA</a></li><li><a>CERRAR</a></li></ul>`

async function conPortal(rutas: Record<string, string>, inicio: string, fn: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    await context.route('**/*', (r) => {
      const u = new URL(r.request().url())
      const html = rutas[`${u.origin}${u.pathname}`]
      return html === undefined ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
    })
    const page = await context.newPage()
    await page.goto(inicio)
    await fn(page)
  } finally {
    await context.close()
  }
}

test('NEGOCIO plegado (en el DOM, no visible) en un MARCO de www.generali.es → el humo pasa', async () => {
  await conPortal({
    [PORTAL]: `<html><body>${cabecera}<iframe src="/mediadores/menu.do"></iframe></body></html>`,
    'https://www.generali.es/mediadores/menu.do': `<html><body>${MENU_PLEGADO}</body></html>`,
  }, `${PORTAL}?mediatorCode=12345`, async (page) => {
    await page.frameLocator('iframe').locator('a', { hasText: 'COMPAÑÍA' }).waitFor()
    await exigirMenuNegocioGenerali(page, { esperaMs: 3_000, pausaMs: 100 })
  })
})

test('NEGOCIO que aparece TARDE (carga lenta tras el mediador) → espera y pasa', async () => {
  const tarde = `<html><body>${cabecera}<div id="m"></div><script>setTimeout(() => { document.getElementById('m').innerHTML = '<a>NEGOCIO</a>' }, 800)</script></body></html>`
  await conPortal({ [PORTAL]: tarde }, PORTAL, async (page) => {
    await exigirMenuNegocioGenerali(page, { esperaMs: 5_000, pausaMs: 100 })
  })
})

test('sin NEGOCIO → `portal` con «diag:» saneado (rutas sin query, pestañas conocidas) y SIN la cabecera; cabe en el aviso de 300', async () => {
  await conPortal({
    [PORTAL]: `<html><body>${cabecera}<ul><li><a>COMPAÑÍA</a></li><li><a style="display:none">CERRAR</a></li></ul></body></html>`,
  }, `${PORTAL}?mediatorCode=12345&token=abc`, async (page) => {
    const e = await exigirMenuNegocioGenerali(page, { esperaMs: 300, pausaMs: 100 }).then(() => null, (x: unknown) => x)
    assert.ok(e instanceof ErrorTarificador, 'tiene que fallar')
    assert.equal(e.tipo, 'portal')
    assert.match(e.message, /«NEGOCIO» no está en ningún marco/)
    assert.match(e.message, /diag: pág CorredorPortal\.po; 1 marco\(s\): CorredorPortal\.po\[COMPAÑÍA visible, CERRAR oculta\]/)
    assert.ok(!e.message.includes(NOMBRE) && !/99999|12345|mediatorCode|token/.test(e.message), 'sin datos de la cabecera ni query')
    const aviso = mensajeFalloHumo('menú', e.message)
    assert.match(aviso, /CERRAR oculta\]$/, 'el diag entero cabe en el aviso del humo (≤300)')
  })
})

test('NEGOCIO fuera de www.generali.es (p. ej. outofservice) → NO pasa', async () => {
  const fuera = 'https://outofservice.generali.es/'
  await conPortal({ [fuera]: `<html><body><a>NEGOCIO</a></body></html>` }, fuera, async (page) => {
    await assert.rejects(exigirMenuNegocioGenerali(page, { esperaMs: 300, pausaMs: 100 }), /diag: pág outofservice\.generali\.es;/)
  })
})

test('diagMenuNegocioGenerali: PURA, compacta y sin query/jsessionid', () => {
  const d = diagMenuNegocioGenerali('https://www.generali.es/a/CorredorPortal.po;jsessionid=XYZ?mediatorCode=1', [
    { url: 'https://www.generali.es/a/CorredorPortal.po?x=1', pestanas: { NEGOCIO: { dom: 1, visibles: 0 }, CERRAR: { dom: 1, visibles: 1 } } },
    { url: 'about:blank', pestanas: {} },
  ])
  assert.equal(d, 'diag: pág CorredorPortal.po; 2 marco(s): CorredorPortal.po[NEGOCIO oculta, CERRAR visible] · about:blank[-]')
  assert.ok(diagMenuNegocioGenerali('https://www.generali.es/', Array.from({ length: 20 }, () => ({ url: 'https://www.generali.es/' + 'x'.repeat(80), pestanas: {} }))).length <= 200)
})

test('humo.ts: Generali comprueba el menú con exigirMenuNegocioGenerali (no con «visible»)', () => {
  const codigo = readFileSync(new URL('../src/humo.ts', import.meta.url), 'utf8')
  const menu = codigo.slice(codigo.indexOf('async function menuGenerali'), codigo.indexOf('/** El humo llegó a la pantalla del SMS'))
  assert.match(menu, /await elegirMediadorGenerali\(page, puerta\)\s*\n\s*\/\/[^\n]*\n\s*await exigirMenuNegocioGenerali\(page, \{ esperaMs: ESPERA_MENU_MS \}\)/)
  assert.ok(!/visible: true/.test(menu), 'el humo de Generali no exige NEGOCIO visible')
})
