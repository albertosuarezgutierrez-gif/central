// Fecha de término real y PDF del «Proyecto» de ePAC (07/10/2026). DOM mínimo copiado de la evidencia real
// (trabajo 083c0927, pestaña Tarificar): `td#MENU` «Proyecto», `td#EMISION_PROJ` «Proyecto Ampliado» y
// `input#fechaTerminoTarificar value="01102027"`. El PDF lo sirve `page.route` (sin red).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from 'playwright'
import { EmisionBloqueadaError, type PdfRef } from '@central/module-tarificacion'
import { descargarProyecto, fechaPortalAIso, leerFechaTermino, pestanaProyecto } from '../src/adapters/allianz/comunidades.ts'
import { esPdf, esperarPdf } from '../src/descarga-pdf.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1')
const URL_PDF = 'https://portal.test/drrg18/jsp4pdf/proyecto.jsp'

let browser: Browser
before(async () => {
  // Tiene que ser el headless SHELL (el de producción): el Chromium completo abre el PDF en su visor y no descarga.
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => browser?.close())

/** Página con la barra de pestañas de Tarificar; `alPulsar` = JS del onclick de «Proyecto». */
async function tarificar(alPulsar: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ acceptDownloads: true })
  await context.route(URL_PDF, (r) => r.fulfill({ status: 200, contentType: 'application/pdf', body: PDF }))
  await context.route('https://portal.test/vacio', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>vacío</p>' }))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<table><tr>
    <td id="TARIFICAR">Tarificar</td>
    <td id="MENU" onclick="${alPulsar}">Proyecto</td>
    <td id="ARCHIVAR">Archivar</td>
    <td id="EMISION_PROJ">Proyecto Ampliado</td>
  </tr></table>
  <input type="text" id="fechaTerminoTarificar" value="01102027" readonly>
  <input type="text" style="display:none" id="fechaTerminoTarificar_fullDate" value="01102027">
  <iframe name="pdf" src="about:blank"></iframe>`)
  return { context, page }
}

function ctxFalso(abrir: (l: Locator) => Promise<void>): { ctx: ContextoPortal; pdfs: Buffer[]; logs: string[] } {
  const pdfs: Buffer[] = []
  const logs: string[] = []
  const ctx = {
    log: (m: string) => logs.push(m),
    abrirProyecto: abrir,
    adjuntarPdf: (nombre: string, c: Uint8Array): PdfRef => {
      pdfs.push(Buffer.from(c))
      return { indice: pdfs.length - 1, nombre }
    },
  } as unknown as ContextoPortal
  return { ctx, pdfs, logs }
}

test('fechaPortalAIso: ddmmaaaa de ePAC y dd/mm/aaaa; lo demás, null', () => {
  assert.equal(fechaPortalAIso('01102027'), '2027-10-01')
  assert.equal(fechaPortalAIso(' 01/10/2027 '), '2027-10-01')
  assert.equal(fechaPortalAIso('01-10-2027'), '2027-10-01')
  assert.equal(fechaPortalAIso('01/102027'), null) // separadores distintos
  assert.equal(fechaPortalAIso('31022027'), null) // fecha imposible
  assert.equal(fechaPortalAIso(''), null)
  assert.equal(fechaPortalAIso(null), null)
  assert.equal(fechaPortalAIso('2027-10-01'), null)
})

test('leerFechaTermino: lee #fechaTerminoTarificar (solo lectura); sin campo → null', async () => {
  const { context, page } = await tarificar('')
  assert.equal(await leerFechaTermino(page.mainFrame(), 'fechaTerminoTarificar'), '2027-10-01')
  assert.equal(await leerFechaTermino(page.mainFrame(), 'fechaTermino'), null)
  await context.close()
})

test('pestanaProyecto: exactamente td#MENU, nunca «Proyecto Ampliado»', async () => {
  const { context, page } = await tarificar('')
  const p = pestanaProyecto(page.mainFrame())
  assert.equal(await p.count(), 1)
  assert.equal(await p.getAttribute('id'), 'MENU')
  await context.close()
})

test('esPdf: solo la cabecera %PDF-', () => {
  assert.equal(esPdf(PDF), true)
  assert.equal(esPdf(Buffer.from('<html>')), false)
  assert.equal(esPdf(null), false)
})

for (const [caso, js] of [
  ['ventana nueva (popup)', `window.open('${URL_PDF}')`],
  ['marco de la página', `window.frames['pdf'].location='${URL_PDF}'`],
] as const) {
  test(`descargarProyecto captura el PDF que sale en ${caso} y lo adjunta`, async () => {
    const { context, page } = await tarificar(js)
    const { ctx, pdfs } = ctxFalso((l) => l.click())
    const r = await descargarProyecto(page, page.mainFrame(), ctx, 'proyecto.pdf')
    assert.equal(r.aviso, null)
    assert.deepEqual(r.pdf, { indice: 0, nombre: 'proyecto.pdf' })
    assert.ok(esPdf(pdfs[0]))
    assert.equal(context.pages().length, 1, 'las ventanas abiertas para el PDF se cierran')
    await context.close()
  })
}

test('sin PDF: aviso legible y pdf null (el precio no se pierde)', async () => {
  const { context, page } = await tarificar('')
  const { ctx } = ctxFalso(async (l) => {
    await l.click()
    throw new Error('el portal no respondió')
  })
  const r = await descargarProyecto(page, page.mainFrame(), ctx, 'proyecto.pdf')
  assert.equal(r.pdf, null)
  assert.match(r.aviso ?? '', /PDF del proyecto no obtenido: allianz\/comunidades: «Proyecto» falló \(el portal no respondió\)/)
  await context.close()
})

test('lo que no es PDF no se adjunta; la espera acaba en null', async () => {
  const { context, page } = await tarificar(`window.open('https://portal.test/vacio')`)
  const espera = esperarPdf(page, 1_500)
  await page.locator('#MENU').click()
  assert.equal(await espera.promesa, null)
  assert.equal(context.pages().length, 1)
  await context.close()
})

test('el guard de emisión NUNCA se traga: EmisionBloqueadaError se relanza', async () => {
  const { context, page } = await tarificar('')
  const { ctx } = ctxFalso(async () => {
    throw new EmisionBloqueadaError('fase', 'proyecto: la pestaña activa no es Tarificar')
  })
  await assert.rejects(descargarProyecto(page, page.mainFrame(), ctx, 'proyecto.pdf'), EmisionBloqueadaError)
  await context.close()
})
