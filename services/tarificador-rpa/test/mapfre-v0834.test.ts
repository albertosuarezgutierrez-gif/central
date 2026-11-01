// Mapfre auto v0.8.34 (27/10/2026, autotest real con 0.8.33): «PDF del proyecto no descargado en Mapfre: falló (locator.click: Timeout 8000ms exceeded …
// waiting for locator('[data-rpa-dl="41"]') …)». El clic de descarga no llegaba a darse y el aviso cortaba la traza sin la causa. Ahora la causa sale de
// la traza y hay UN reintento (Escape si una capa lo tapa; re-escaneo con marcas nuevas si el portal lo re-pinta). Fixtures SINTÉTICAS, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import { buscarBotonDescargaProyecto, causaClicNoPulsado, DescargaNoPulsadaError, instalarGuardEmision, pulsarDescargaProyectoAuto, type CompaniaDescargaProyecto } from '../src/guard.ts'
import { descargarProyectoAuto } from '../src/descarga-proyecto-auto.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + ' '.repeat(80), 'latin1')

test('v0.8.34 · versión', () => assert.equal(mapfreAuto.version, '0.8.47'))

test('v0.8.34 · puro: la causa sale de la traza de Playwright (la última línea de estado manda)', () => {
  const tapado = `locator.click: Timeout 6000ms exceeded.\nCall log:\n  - waiting for locator('[data-rpa-dl="41"]')\n  - locator resolved to <button>…</button>\n  - attempting click action\n  - waiting for element to be visible, enabled and stable\n  - element is visible, enabled and stable\n  - <div class="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing"></div> intercepts pointer events\n  - retrying click action`
  assert.deepEqual(causaClicNoPulsado(tapado), { causa: 'tapado', detalle: 'tapa: <div.cdk-overlay-backdrop.cdk-overlay-dark-backdrop.cdk-overlay-backdrop-showing>' })
  assert.equal(causaClicNoPulsado(`locator.click: Timeout\n - locator resolved to <a>x</a>\n - element is not visible\n - retrying`).causa, 'oculto')
  assert.equal(causaClicNoPulsado(`locator.click: Timeout\n - locator resolved to <a>x</a>\n - element is not stable\n - retrying`).causa, 'inestable')
  assert.equal(causaClicNoPulsado(`locator.click: Timeout\n - locator resolved to <a>x</a>\n - element is outside of the viewport`).causa, 'fuera_de_vista')
  assert.equal(causaClicNoPulsado(`locator.click: Timeout\n - locator resolved to <a>x</a>\n - element was detached from the DOM, retrying`).causa, 'desaparecido')
  // Nunca resolvió el localizador: el control (marcado) ya no está → re-pintado.
  assert.equal(causaClicNoPulsado(`locator.click: Timeout 8000ms exceeded.\nCall log:\n  - waiting for locator('[data-rpa-dl="41"]')`).causa, 'desaparecido')
  // El detalle no arrastra texto ni atributos con datos (solo etiqueta y clases).
  const d = causaClicNoPulsado(`Timeout\n - locator resolved to <a>x</a>\n - <span data-x="12345678Z" class="nombre">Pepe Pérez</span> intercepts pointer events`).detalle
  assert.equal(d, 'tapa: <span.nombre>')
  assert.match(new DescargaNoPulsadaError('tapado', d).message, /otro elemento \(capa\/diálogo\) lo tapa/)
})

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

const BOTON = `<button type="button" id="imp" onclick="window.__p=(window.__p||0)+1;location.href='/doc.pdf'">Imprimir proyecto</button>`
/** Capa a pantalla completa (como el fondo de un diálogo de Material) que se cierra con Escape. */
const CAPA_ESCAPE = `<div id="capa" class="cdk-overlay-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:10"></div><script>document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){const c=document.getElementById('capa');if(c)c.remove()}})</script>`
const CAPA_FIJA = `<div id="capa" class="cdk-overlay-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:10"></div>`

async function abrir(cuerpo: string, opciones: { repintarTrasEscanear?: boolean } = {}) {
  const context: BrowserContext = await browser.newContext({ acceptDownloads: true })
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === '/doc.pdf') return r.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="doc.pdf"' }, body: PDF_MINIMO })
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><h1>Proyectos</h1>${cuerpo}</body></html>` })
  })
  const page: Page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://portal.test/proyecto')
  const adjuntos: Buffer[] = []
  let busquedas = 0
  const ctx = {
    adjuntarPdf: (nombre: string, bytes: Uint8Array) => (adjuntos.push(Buffer.from(bytes)), { indice: adjuntos.length - 1, nombre }),
    log: () => {},
    buscarDescargaProyectoAuto: async (p: Page, c: CompaniaDescargaProyecto, g: boolean) => {
      const r = await buscarBotonDescargaProyecto(p, guard, c, g, 600)
      // Como Angular tras «Generar Proyecto»: la primera vez, justo después de marcar, el portal re-pinta el botón (nodo nuevo, sin la marca).
      if (opciones.repintarTrasEscanear && busquedas++ === 0) await p.evaluate(() => { const b = document.getElementById('imp')!; const n = b.cloneNode(true) as HTMLElement; n.removeAttribute('data-rpa-dl'); b.replaceWith(n) })
      return r
    },
    pulsarDescargaProyectoAuto: (p: Page, b: Locator, c: CompaniaDescargaProyecto, g: boolean) => pulsarDescargaProyectoAuto(p, guard, b, c, g),
  }
  return { context, page, ctx, adjuntos }
}
const pulsaciones = (page: Page) => page.evaluate(() => (window as unknown as { __p?: number }).__p ?? 0)

test('v0.8.34 · una capa (fondo de diálogo) tapa el botón: Escape, re-escaneo y UN reintento → PDF capturado', async () => {
  const { context, page, ctx, adjuntos } = await abrir(BOTON + CAPA_ESCAPE)
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.aviso, null, r.aviso ?? '')
    assert.ok(r.pdf)
    assert.equal(adjuntos.length, 1)
    assert.equal(await pulsaciones(page), 1, 'el botón se pulsó exactamente una vez')
  } finally {
    await context.close()
  }
})

test('v0.8.34 · el portal re-pinta el botón tras marcarlo: re-escaneo con marca nueva y UN reintento → PDF capturado', async () => {
  const { context, page, ctx, adjuntos } = await abrir(BOTON, { repintarTrasEscanear: true })
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.aviso, null, r.aviso ?? '')
    assert.equal(adjuntos.length, 1)
    assert.equal(await pulsaciones(page), 1)
  } finally {
    await context.close()
  }
})

test('v0.8.34 · una capa que NO se cierra: no se pulsa nada (ni force ni coordenadas) y el aviso dice la causa', async () => {
  const { context, page, ctx, adjuntos } = await abrir(BOTON + CAPA_FIJA)
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /^PDF del proyecto no descargado en Mapfre: «Imprimir proyecto»: el control de descarga no se pudo pulsar: otro elemento \(capa\/diálogo\) lo tapa \(tapa: <div\.cdk-overlay-backdrop>; no hay ningún diálogo a la vista \(la capa es otra cosa\)\) \(también tras Escape y un reintento\)$/)
    assert.equal(adjuntos.length, 0)
    assert.equal(await pulsaciones(page), 0, 'el botón tapado no recibió ningún clic')
    assert.equal(await page.locator('#capa').count(), 1, 'la capa sigue (nada la aceptó ni la pulsó)')
  } finally {
    await context.close()
  }
})
