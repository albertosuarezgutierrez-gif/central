// Explorador 0.3.9 (28/10/2026, Allianz patinete): `<x>_tipoDoc` NO es un <select> sino input + lista. Páginas SINTÉTICAS, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { elegirTipoDocumentoPareado } from '../src/explorador.ts'

let browser: Browser
before(async () => {
  const opciones = { headless: true }
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

const LISTA_ARIA = (opciones: string[]) => `<label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo Doc. Tomador</label>
  <input id="IntervinientesBean$nifTomador_tipoDoc" role="combobox" aria-controls="lst" readonly value="">
  <div id="lst" role="listbox" hidden>${opciones.map((o) => `<div role="option">${o}</div>`).join('')}</div>
  <input id="IntervinientesBean$nifTomador_doc">
  <script>
    const t = document.getElementById('IntervinientesBean$nifTomador_tipoDoc')
    t.addEventListener('click', () => { document.getElementById('lst').hidden = false })
    for (const o of document.querySelectorAll('[role=option]')) o.addEventListener('click', () => { t.value = o.textContent; document.getElementById('lst').hidden = true })
  </script>`
const LISTA_JSF = `<span id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo Doc. Tomador</span>
  <input id="IntervinientesBean$nifTomador_tipoDoc" readonly value="">
  <ul id="IntervinientesBean$nifTomador_tipoDoc_lista" hidden><li>CIF</li><li>NIF</li></ul>
  <input id="IntervinientesBean$nifTomador_doc">
  <script>
    const t = document.getElementById('IntervinientesBean$nifTomador_tipoDoc'), u = document.querySelector('ul')
    t.addEventListener('click', () => { u.hidden = false })
    for (const l of u.querySelectorAll('li')) l.addEventListener('click', () => { t.value = l.textContent; u.hidden = true })
  </script>`

async function pagina(html: string): Promise<{ page: Page; doc: Locator; pulsados: string[]; pulsar: (b: Locator) => Promise<void> }> {
  const page = await browser.newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`)
  const pulsados: string[] = []
  return { page, doc: page.locator('[id="IntervinientesBean$nifTomador_doc"]'), pulsados, pulsar: async (b) => { pulsados.push(((await b.innerText().catch(() => '')) || (await b.getAttribute('id')) || '').trim()); await b.click() } }
}
const valor = (p: Page) => p.locator('[id="IntervinientesBean$nifTomador_tipoDoc"]').inputValue()

test('_tipoDoc = input + listbox/option: abre con el pulsar guardado y elige «NIF» (no «NIF extranjero») antes de rellenar', async () => {
  const { page, doc, pulsados, pulsar } = await pagina(LISTA_ARIA(['CIF', 'NIF', 'NIE', 'Pasaporte']))
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await valor(page), 'NIF')
  assert.equal(pulsados.length, 2, 'abrir + opción, ambos por el pulsar guardado')
  assert.equal(pulsados[1], 'NIF')
  await page.close()
})

test('_tipoDoc = input + lista JSF ul/li', async () => {
  const { page, doc, pulsar } = await pagina(LISTA_JSF)
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await valor(page), 'NIF')
  await page.close()
})

test('ya tiene NIF → «ya», sin pulsar; 0 o 2 candidatas → «sin_opcion» sin pulsar opción; sin pulsar guardado → «sin_desplegable»', async () => {
  const a = await pagina(LISTA_ARIA(['NIF']).replace('value=""', 'value="NIF"'))
  assert.equal(await elegirTipoDocumentoPareado(a.page.mainFrame(), a.doc, 'NIF', a.pulsar), 'ya')
  assert.deepEqual(a.pulsados, [])
  const b = await pagina(LISTA_ARIA(['CIF', 'Pasaporte']))
  assert.equal(await elegirTipoDocumentoPareado(b.page.mainFrame(), b.doc, 'NIF', b.pulsar), 'sin_opcion')
  assert.equal(b.pulsados.length, 1, 'solo se abrió')
  assert.equal(await valor(b.page), '')
  const c = await pagina(LISTA_ARIA(['NIF', 'DNI']))
  assert.equal(await elegirTipoDocumentoPareado(c.page.mainFrame(), c.doc, 'NIF', c.pulsar), 'sin_opcion')
  assert.equal(await valor(c.page), '')
  const d = await pagina(LISTA_ARIA(['NIF']))
  assert.equal(await elegirTipoDocumentoPareado(d.page.mainFrame(), d.doc, 'NIF'), 'sin_desplegable')
  for (const x of [a, b, c, d]) await x.page.close()
})

test('una SEGUNDA lista visible en otro punto de la página con «NIF» NO se elige: solo cuentan las opciones del propio control', async () => {
  const señuelo = '<ul class="dropdown-menu" id="otro"><li>NIF</li></ul><div role="listbox"><div role="option">NIF</div></div>'
  const { page, doc, pulsados, pulsar } = await pagina(señuelo + LISTA_ARIA(['CIF', 'Pasaporte']))
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'sin_opcion')
  assert.equal(await valor(page), '')
  assert.equal(pulsados.length, 1, 'solo se abrió el propio control; no se pulsó el señuelo')
  await page.close()
})
