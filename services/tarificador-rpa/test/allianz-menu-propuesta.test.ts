// Allianz Turismos 0.6.30 (26/10/2026): «Descargar propuesta» descartado por un atributo interno («sms»). (1) El aviso dice QUÉ atributo y un extracto
// saneado; (2) si es un disparador de menú, se ABRE (un clic) y solo se elige una opción de descarga/PDF/imprimir sin bloqueo. «Enviar por SMS» NUNCA se pulsa.
// Fixtures SINTÉTICOS (sin datos personales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import {
  buscarBotonDescargaProyecto, decidirBotonDescargaProyecto, detalleRechazoOcultoDescarga, esDisparadorMenuDescarga, extractoSaneadoDescarga,
  instalarGuardEmision, nombreAtributoDescarga, pulsarDescargaProyectoAuto, puedeAbrirMenuDescarga, type CompaniaDescargaProyecto, type ControlDescargaProyecto,
} from '../src/guard.ts'
import { descargarProyectoAuto } from '../src/descarga-proyecto-auto.ts'

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n' + ' '.repeat(80), 'latin1')
const MENU = { 'aria-haspopup': 'true', 'aria-expanded': 'false', class: 'btn dropdown-toggle' }
const ctrl = (rotulo: string, ocultos: (string | null)[] = [], attrs: Record<string, string> | undefined = undefined): ControlDescargaProyecto => ({ desc: [rotulo, null, null, null, ...ocultos], visible: true, habilitado: true, attrs })

test('pura: nombre del atributo por índice', () => {
  assert.equal(nombreAtributoDescarga(4), 'id')
  assert.equal(nombreAtributoDescarga(7), 'onclick')
  assert.equal(nombreAtributoDescarga(12), 'ancestro 1 onclick')
  assert.equal(nombreAtributoDescarga(15), 'ancestro 1 href')
  assert.equal(nombreAtributoDescarga(16), 'ancestro 2 onclick')
})

test('pura: extracto de ±30 caracteres, sin emails ni cifras largas', () => {
  const x = extractoSaneadoDescarga('abrir(); enviarSms("ana.perez@correo.test", 600123456); cerrar()', 'sms')
  assert.match(x, /sms/)
  assert.ok(!/@correo|ana\.perez|600123456/.test(x), x)
  assert.ok(x.length <= 30 + 3 + 30 + 2, x)
  assert.equal(extractoSaneadoDescarga('ana.perez.sms@correo.test', 'sms'), '…', 'si la palabra estaba dentro de un email, no se cuenta nada')
})

test('pura: el motivo nombra palabra + atributo + extracto + disparador de menú', () => {
  const c = ctrl('Descargar propuesta', ['menu-sms-propuesta'], MENU)
  assert.match(detalleRechazoOcultoDescarga(c, 'allianz', true)!, /^«sms» en id \(«menu-sms-propuesta»\) \[disparador de menú\]$/)
  const d = decidirBotonDescargaProyecto([c], 'allianz', true)
  assert.ok('motivo' in d && /lista negra: «sms» en id \(«menu-sms-propuesta»\) \[disparador de menú\]\)/.test(d.motivo), JSON.stringify(d))
  const sinMenu = decidirBotonDescargaProyecto([ctrl('Descargar propuesta', [null, null, null, 'lanzarsms()'])], 'allianz', true)
  assert.ok('motivo' in sinMenu && /«sms» en onclick/.test(sinMenu.motivo) && !/disparador/.test(sinMenu.motivo), JSON.stringify(sinMenu))
  assert.equal(detalleRechazoOcultoDescarga(ctrl('Descargar propuesta'), 'allianz', true), null)
})

test('pura: disparador de menú', () => {
  assert.equal(esDisparadorMenuDescarga({ 'aria-haspopup': 'menu' }), true)
  assert.equal(esDisparadorMenuDescarga({ 'aria-expanded': 'false' }), true)
  assert.equal(esDisparadorMenuDescarga({ class: 'a Dropdown-toggle' }), true)
  assert.equal(esDisparadorMenuDescarga({ 'aria-haspopup': 'false' }), false)
  assert.equal(esDisparadorMenuDescarga({ class: 'btn' }), false)
  assert.equal(esDisparadorMenuDescarga(undefined), false)
})

test('pura: un menú «Descargar propuesta» solo se abre si NINGÚN atributo ni rótulo casan bloqueo', () => {
  const ok = (rotulo: string, ocultos: (string | null)[], attrs: Record<string, string> = MENU) => puedeAbrirMenuDescarga(ctrl(rotulo, ocultos, attrs), 'allianz', true)
  assert.equal(ok('Descargar propuesta', ['menu-propuesta']), true)
  assert.equal(ok('Descargar propuesta arrow_drop_down', ['menu-propuesta']), true)
  assert.equal(ok('Descargar propuesta', ['menu-sms']), false, 'id')
  assert.equal(ok('Descargar propuesta', ['menu', 'sms-name']), false, 'name')
  assert.equal(ok('Descargar propuesta', ['menu'], { ...MENU, class: 'btn sms-toggle' }), false, 'class')
  assert.equal(ok('Descargar propuesta', ['menu'], { ...MENU, 'aria-controls': 'menu-sms' }), false, 'aria-controls')
  assert.equal(ok('Descargar propuesta', ['menu'], { ...MENU, 'data-canal': 'sms' }), false, 'data-*')
  assert.equal(ok('Descargar propuesta', [null, null, '/enviar-sms']), false, 'href')
  assert.equal(ok('Descargar propuesta', [null, null, null, 'lanzarsms()']), false, 'onclick')
  assert.equal(ok('Descargar propuesta', [null, null, null, null, 'lanzarsms()']), false, 'formaction')
  assert.equal(ok('Descargar propuesta', [null, null, null, null, null, 'lanzarsms()']), false, 'ng-click')
  assert.equal(ok('Descargar propuesta', [null, null, null, null, null, null, null, 'x', null, null, null, 'lanzarsms()']), false, 'ancestro')
  assert.equal(ok('Descargar propuesta por SMS', ['menu']), false, 'rótulo con bloqueo')
  assert.equal(ok('Enviar propuesta', ['menu']), false)
  assert.equal(ok('Descargar presupuesto', ['menu']), false, 'solo «Descargar propuesta»')
  assert.equal(ok('Descargar propuesta', ['menu'], { class: 'btn' }), false, 'no es disparador de menú')
  assert.equal(puedeAbrirMenuDescarga({ ...ctrl('Descargar propuesta', ['menu'], MENU), habilitado: false }, 'allianz', true), false)
  assert.equal(puedeAbrirMenuDescarga({ ...ctrl('Descargar propuesta', ['menu'], MENU), visible: false }, 'allianz', true), false)
  const d = decidirBotonDescargaProyecto([ctrl('ePac'), ctrl('Descargar propuesta', ['menu-sms'], MENU)], 'allianz', true)
  assert.ok('motivo' in d && d.abrirMenu === undefined && /\[disparador de menú\]/.test(d.motivo), JSON.stringify(d))
})

// ── Navegador ──
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

async function abrir(cuerpo: string) {
  const context: BrowserContext = await browser.newContext({ acceptDownloads: true })
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const url = new URL(r.request().url())
    if (url.pathname === '/doc.pdf') return r.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="doc.pdf"' }, body: PDF_MINIMO })
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><h1>Presupuesto guardado</h1>${cuerpo}</body></html>` })
  })
  const page: Page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.goto('https://portal.test/proyecto')
  const adjuntos: Buffer[] = []
  const pulsados: string[] = []
  const ctx = {
    adjuntarPdf: (nombre: string, bytes: Uint8Array) => (adjuntos.push(Buffer.from(bytes)), { indice: adjuntos.length - 1, nombre }),
    log: () => {},
    buscarDescargaProyectoAuto: (p: Page, c: CompaniaDescargaProyecto, g: boolean) => buscarBotonDescargaProyecto(p, guard, c, g, 600),
    pulsarDescargaProyectoAuto: async (p: Page, b: Locator, c: CompaniaDescargaProyecto, g: boolean) => {
      pulsados.push((await b.innerText().catch(() => '')).trim())
      return pulsarDescargaProyectoAuto(p, guard, b, c, g)
    },
  }
  return { context, page, ctx, adjuntos, pulsados }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)

const DISPARADOR = '<button type="button" id="menu-sms-propuesta" aria-haspopup="true" aria-expanded="false" class="dropdown-toggle" onclick="document.getElementById(\'m\').hidden=false">Descargar propuesta</button>'
const CIERRE_ESC = '<script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){document.getElementById("m").hidden=true;window.__escape=1}})</script>'

test('disparador con id «sms»: NO se abre ni se pulsa; con un menú ya visible, «Enviar por SMS» y la opción con «enviar por SMS» NUNCA se pulsan', async () => {
  const { context, page, ctx, adjuntos, pulsados } = await abrir(
    `${DISPARADOR}<div id="m">` +
      '<button type="button" onclick="window.__sms=1">Enviar por SMS</button>' +
      '<button type="button" onclick="window.__email=1">Enviar por email</button>' +
      '<button type="button" data-canal="sms" onclick="location.href=\'/doc.pdf\'">Descargar PDF</button>' + // atributo con sms: se descarta
      '<button type="button" onclick="window.__dec2=1">Descargar PDF y enviar por SMS</button>' + // rótulo con enviar/sms: se descarta
      '<button type="button" id="opcion-pdf" onclick="location.href=\'/doc.pdf\'">Imprimir PDF</button></div>',
  )
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 8_000)
    assert.equal(r.aviso, null, String(r.aviso))
    assert.equal(adjuntos.length, 1)
    assert.deepEqual(pulsados, ['Imprimir PDF'], 'el disparador con «sms» no se abre')
    for (const k of ['__sms', '__dec2', '__email']) assert.equal(await marca(page, k), null, `${k} no se pulsa`)
  } finally {
    await context.close()
  }
})

test('disparador con id «sms» y menú oculto: no se abre, no se pulsa nada y el aviso dice atributo + extracto + [disparador de menú]', async () => {
  const { context, page, ctx, adjuntos, pulsados } = await abrir(
    `${DISPARADOR}<div id="m" hidden><button type="button" onclick="window.__sms=1">Enviar por SMS</button><button type="button" onclick="window.__email=1">Enviar por email</button></div>${CIERRE_ESC}`,
  )
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 8_000)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /«sms» en id \(«menu-sms-propuesta»\) \[disparador de menú\]/)
    assert.deepEqual(pulsados, [])
    assert.equal(adjuntos.length, 0)
    for (const k of ['__sms', '__email', '__escape']) assert.equal(await marca(page, k), null, k)
  } finally {
    await context.close()
  }
})

test('cepo: disparador cuyo onclick envía por SMS NO se abre ni se pulsa', async () => {
  const { context, page, ctx, pulsados } = await abrir(
    '<button type="button" aria-haspopup="true" aria-expanded="false" onclick="window.__sms=1;document.getElementById(\'m\').hidden=false">Descargar propuesta</button><div id="m" hidden><button type="button" onclick="location.href=\'/doc.pdf\'">Imprimir PDF</button></div>',
  )
  try {
    const r = await descargarProyectoAuto(page, ctx, 'allianz', 'presupuesto.pdf', true, 8_000)
    assert.equal(r.pdf, null)
    assert.match(r.aviso!, /«sms» en onclick/)
    assert.match(r.aviso!, /\[disparador de menú\]/)
    assert.deepEqual(pulsados, [])
    assert.equal(await marca(page, '__sms'), null)
  } finally {
    await context.close()
  }
})

test('cepo: el guard vivo rechaza abrir un menú cuyo rótulo no es «Descargar propuesta»', async () => {
  const { context, page, ctx } = await abrir('<button type="button" id="x-sms" aria-haspopup="true" onclick="window.__abierto=1">Otras opciones</button>')
  try {
    await assert.rejects(ctx.pulsarDescargaProyectoAuto(page, page.locator('#x-sms'), 'allianz', true), /lista blanca/)
    assert.equal(await marca(page, '__abierto'), null)
  } finally {
    await context.close()
  }
})
