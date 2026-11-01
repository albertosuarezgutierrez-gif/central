// Mapfre auto v0.8.35 (28/10/2026, ejecución real con 0.8.34): «picture_as_pdf» tapado por `cdk-overlay-backdrop` (diálogo de Material que Escape no cierra).
// Ahora: control de descarga DENTRO del diálogo → se pulsa ahí; diálogo informativo (solo controles de cerrar, sin campos ni texto de emitir/contratar/enviar/
// firmar/pagar) → se cierra con rótulo EXACTO y se reintenta; si no, aviso con su texto saneado y sus botones. Fixtures SINTÉTICAS, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import { buscarBotonDescargaProyecto, decidirCierreDialogoDescarga, decidirBotonDescargaProyecto, describirDialogoDescarga, instalarGuardEmision, pulsarDescargaProyectoAuto, type CompaniaDescargaProyecto } from '../src/guard.ts'
import { descargarProyectoAuto } from '../src/descarga-proyecto-auto.ts'
import { mapfreAuto } from '../src/adapters/mapfre/auto.ts'

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + ' '.repeat(80), 'latin1')

test('v0.8.35 · versión', () => assert.equal(mapfreAuto.version, '0.8.47'))

test('v0.8.35 · puro: solo se cierra un diálogo informativo, con rótulo EXACTO de cerrar (la cruz antes que «Aceptar»)', () => {
  const d = (texto: string, botones: string[], campos = 0) => decidirCierreDialogoDescarga({ texto, botones, campos })
  assert.deepEqual(d('Proyecto guardado correctamente', ['Aceptar']), { indice: 0 })
  assert.deepEqual(d('Proyecto guardado correctamente', ['Aceptar', 'close']), { indice: 1 })
  assert.deepEqual(d('Información', ['OK']), { indice: 0 })
  assert.deepEqual(d('Información', ['Cerrar', 'Aceptar']), { indice: 0 })
  for (const [texto, botones, campos] of [
    ['Proyecto guardado', ['Aceptar', 'Contratar'], 0],
    ['Proyecto guardado', ['Aceptar y continuar'], 0],
    ['¿Desea emitir la póliza?', ['Aceptar'], 0],
    ['Se enviará la documentación por email al tomador', ['Aceptar'], 0],
    ['Firma del cliente', ['Cerrar'], 0],
    ['Introduzca el teléfono', ['Aceptar'], 1],
    ['Sin botones', [], 0],
  ] as const) assert.ok('motivo' in d(texto, [...botones], campos), `${texto} · ${botones.join('|')}`)
})

test('v0.8.35 · puro: con un diálogo abierto, el control de descarga de DENTRO manda; la descripción del diálogo no lleva datos personales', () => {
  const c = (texto: string, enDialogo: boolean) => ({ desc: [texto], visible: true, habilitado: true, enDialogo })
  assert.deepEqual(decidirBotonDescargaProyecto([c('Imprimir proyecto', false), c('Imprimir', true)], 'mapfre', true), { indice: 1 })
  assert.deepEqual(decidirBotonDescargaProyecto([c('Imprimir proyecto', false)], 'mapfre', true), { indice: 0 })
  const t = describirDialogoDescarga({ texto: 'Proyecto 12345678 de Juan Pérez García guardado. Contacto juan@correo.es', botones: ['Aceptar', 'Contratar'], campos: 0 })
  assert.doesNotMatch(t, /Juan|Pérez|12345678|correo\.es/)
  assert.match(t, /^diálogo: «[^»]*\[nombre\][^»]*»; botones: «Aceptar», «Contratar»$/)
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

/** Botón de la pantalla (como el «picture_as_pdf» real) y un diálogo de Material con capa: Escape NO lo cierra; sus botones apuntan su pulsación. */
const BOTON = `<button type="button" id="imp" aria-label="x" onclick="window.__p=(window.__p||0)+1;location.href='/doc.pdf'"><span class="material-icons">picture_as_pdf</span></button>`
const DIALOGO = (texto: string, botones: string) =>
  `<div class="cdk-overlay-container"><div id="capa" class="cdk-overlay-backdrop cdk-overlay-dark-backdrop cdk-overlay-backdrop-showing" style="position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:10"></div>`
  + `<div class="cdk-overlay-pane" style="position:fixed;top:30%;left:30%;z-index:11"><mat-dialog-container role="dialog" style="display:block;background:#fff;padding:12px"><p>${texto}</p>${botones}</mat-dialog-container></div></div>`
  + `<script>window.cerrarDlg=function(){document.querySelector('.cdk-overlay-container').remove()}</script>`
const BTN = (rotulo: string, k: string, cierra = false) => `<button type="button" onclick="window.${k}=(window.${k}||0)+1;${cierra ? 'cerrarDlg()' : ''}">${rotulo}</button>`

async function abrir(cuerpo: string) {
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
  const ctx = {
    adjuntarPdf: (nombre: string, bytes: Uint8Array) => (adjuntos.push(Buffer.from(bytes)), { indice: adjuntos.length - 1, nombre }),
    log: () => {},
    buscarDescargaProyectoAuto: (p: Page, c: CompaniaDescargaProyecto, g: boolean) => buscarBotonDescargaProyecto(p, guard, c, g, 600),
    pulsarDescargaProyectoAuto: (p: Page, b: Locator, c: CompaniaDescargaProyecto, g: boolean) => pulsarDescargaProyectoAuto(p, guard, b, c, g),
  }
  return { context, page, ctx, adjuntos }
}
const cuenta = (page: Page, k: string) => page.evaluate((x) => ((window as unknown as Record<string, number>)[x] ?? 0), k)

test('v0.8.35 · diálogo informativo («Proyecto guardado» + «Aceptar») tapa la descarga: se cierra con «Aceptar» exacto y se descarga el PDF', async () => {
  const { context, page, ctx, adjuntos } = await abrir(BOTON + DIALOGO('Proyecto guardado correctamente', BTN('Aceptar', '__ok', true)))
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.aviso, null, r.aviso ?? '')
    assert.equal(adjuntos.length, 1)
    assert.equal(await cuenta(page, '__ok'), 1, '«Aceptar» del diálogo, una vez')
    assert.equal(await cuenta(page, '__p'), 1, 'la descarga, una vez')
  } finally {
    await context.close()
  }
})

test('v0.8.35 · diálogo con «Contratar»: NO se pulsa nada del diálogo ni la descarga; el aviso trae su texto y sus botones', async () => {
  const { context, page, ctx, adjuntos } = await abrir(BOTON + DIALOGO('Proyecto guardado correctamente', BTN('Contratar', '__c') + BTN('Cerrar', '__x', true)))
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.pdf, null)
    assert.equal(adjuntos.length, 0)
    assert.match(r.aviso!, /otro elemento \(capa\/diálogo\) lo tapa \(tapa: <div\.cdk-overlay-backdrop[^>]*>; el diálogo menciona «contrat» \(no se pulsa\); diálogo: «Proyecto guardado correctamente[^»]*»; botones: «Contratar», «Cerrar»\)/)
    for (const k of ['__c', '__x', '__p']) assert.equal(await cuenta(page, k), 0, k)
  } finally {
    await context.close()
  }
})

test('v0.8.35 · el control de descarga está DENTRO del diálogo: se pulsa ahí (el de debajo, no)', async () => {
  const dentro = `<button type="button" onclick="window.__d=(window.__d||0)+1;location.href='/doc.pdf'">Imprimir proyecto</button>`
  const { context, page, ctx, adjuntos } = await abrir(BOTON + DIALOGO('Proyecto guardado', dentro + BTN('Cerrar', '__x', true)))
  try {
    const r = await descargarProyectoAuto(page, ctx, 'mapfre', 'proyecto-mapfre-auto.pdf', true, 8_000, 30_000)
    assert.equal(r.aviso, null, r.aviso ?? '')
    assert.equal(adjuntos.length, 1)
    assert.equal(await cuenta(page, '__d'), 1)
    assert.equal(await cuenta(page, '__p'), 0)
    assert.equal(await cuenta(page, '__x'), 0, 'el diálogo no se cierra: no hacía falta')
  } finally {
    await context.close()
  }
})
