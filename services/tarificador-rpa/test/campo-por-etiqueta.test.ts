// `campoPorEtiqueta` sobre un HTML MÍNIMO INVENTADO (06/10/2026). Cepo del bug de la unión XPath: la unión se
// ordenaba por documento y, en una fila «Fecha Inicio [a] Fecha Fin [b]», «Fecha Fin» devolvía [a].
//   npm test   (Chromium sin red ni JavaScript de página)

import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { campoPorEtiqueta } from '../src/adapters/allianz/comunidades.ts'

const HTML = `<!doctype html><html><body><form>
<table>
  <tr><td><label>Fecha Inicio *</label></td><td><input id="ini"></td><td><label>Fecha Fin *</label></td><td><input id="fin"></td></tr>
</table>
<table>
  <tr><td><input type="checkbox" id="chkPlagas"></td><td><label>Asistencia Plagas</label></td></tr>
</table>
<table>
  <tr><td><input type="checkbox" id="chkJuridico"></td><td><label>Asesoramiento</label></td></tr>
</table>
<table><tr>
  <td><table><tr><td><label>Nº Edificios *</label></td><td><input id="nedif"></td></tr></table></td>
  <td><table><tr><td><select id="contiguos"><option>Contiguos</option></select></td></tr></table></td>
  <td><table><tr><td><label>Nº Viviendas *</label></td><td><input id="nviv"></td></tr></table></td>
</tr></table>
</form></body></html>`

let browser: Browser
let page: Page

async function lanzar(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

before(async () => {
  browser = await lanzar()
  const context = await browser.newContext({ javaScriptEnabled: false })
  await context.route('**/*', (r) => r.abort())
  page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(HTML)
})
after(async () => browser?.close())

async function idDe(etiqueta: string, indice = 0): Promise<string> {
  const loc = await campoPorEtiqueta(page.mainFrame(), etiqueta, indice)
  assert.equal(await loc.count(), 1, `«${etiqueta}» [#${indice}] tiene que resolver a UN control`)
  return loc.evaluate((el) => el.id)
}

test('fila con dos pares: cada etiqueta, su control (no el primero de la fila)', async () => {
  assert.equal(await idDe('Fecha Inicio'), 'ini')
  assert.equal(await idDe('Fecha Fin'), 'fin')
})

test('checkbox a la izquierda: el de SU fila, no el de la fila siguiente', async () => {
  assert.equal(await idDe('Asistencia Plagas'), 'chkPlagas')
  assert.equal(await idDe('Asesoramiento'), 'chkJuridico')
})

test('input + select en el tramo de la etiqueta (indice), sin pasar a la siguiente', async () => {
  assert.equal(await idDe('Nº Edificios'), 'nedif')
  assert.equal(await idDe('Nº Edificios', 1), 'contiguos')
  assert.equal(await idDe('Nº Viviendas'), 'nviv')
  // El tercero del tramo de «Nº Edificios» NO existe: no puede saltar al input de «Nº Viviendas».
  await assert.rejects(campoPorEtiqueta(page.mainFrame(), 'Nº Edificios', 2), /tramo solo tiene 2/)
})
