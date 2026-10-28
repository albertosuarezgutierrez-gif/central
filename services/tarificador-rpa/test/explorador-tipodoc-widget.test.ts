// Explorador 0.3.9 (28/10/2026, Allianz patinete): `<x>_tipoDoc` NO es un <select> sino input + lista. Páginas SINTÉTICAS, sin datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { catalogoTipoDocumento, lineaCatalogoTipoDoc, diagnosticoTipoDocumento, elegirTipoDocumentoPareado, lineaDiagnosticoTipoDoc } from '../src/explorador.ts'

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

// 0.3.10 (Allianz patinete real): existe `..._tipoDoc_label` pero NO `..._tipoDoc`. RichFaces-like: el control lleva un id derivado.
const RICH_INPUT = `<label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo Doc. Tomador</label>
  <input id="IntervinientesBean$nifTomador_tipoDoc_input" readonly value="">
  <ul id="IntervinientesBean$nifTomador_tipoDoc_lista" hidden><li>CIF</li><li>NIF</li></ul>
  <ul id="otraLista"><li>NIF</li></ul>
  <input id="IntervinientesBean$nifTomador_doc">
  <script>
    const t = document.getElementById('IntervinientesBean$nifTomador_tipoDoc_input'), u = document.getElementById('IntervinientesBean$nifTomador_tipoDoc_lista')
    t.addEventListener('click', () => { u.hidden = false })
    for (const l of u.querySelectorAll('li')) l.addEventListener('click', () => { t.value = l.textContent; u.hidden = true })
  </script>`

test('0.3.10 · sin `_tipoDoc` pero con `_tipoDoc_input` + lista con la misma base: elige NIF (nunca la lista ajena)', async () => {
  const { page, doc, pulsados, pulsar } = await pagina(RICH_INPUT)
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await page.locator('[id="IntervinientesBean$nifTomador_tipoDoc_input"]').inputValue(), 'NIF')
  assert.equal(pulsados.length, 2)
  await page.close()
})

test('0.3.10 · control derivado sin separador (`_tipoDocNumero`): NO es el desplegable → no se elige', async () => {
  const { page, doc, pulsados, pulsar } = await pagina(RICH_INPUT.replaceAll('_tipoDoc_input', '_tipoDocNumero'))
  assert.notEqual(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await page.locator('[id="IntervinientesBean$nifTomador_tipoDocNumero"]').inputValue(), '')
  assert.ok(!pulsados.includes('NIF'))
  await page.close()
})

test('0.3.10 · `_tipoDoc_label` + select derivado (`_tipoDocMenu`): selectOption sobre ese select', async () => {
  const { page, doc, pulsar } = await pagina(`<label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo</label>
    <select id="IntervinientesBean$nifTomador_tipoDocMenu" style="display:none"><option value="">-</option><option value="C">CIF</option><option value="N">NIF</option></select>
    <input id="IntervinientesBean$nifTomador_doc">`)
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await page.locator('select').inputValue(), 'N')
  await page.close()
})

test('0.3.10 · solo la etiqueta (sin control ni lista): sin_opcion + diagnóstico estructural SIN valores y ≤15 elementos', async () => {
  const muchos = Array.from({ length: 30 }, (_, i) => `<span id="IntervinientesBean$nifTomador_tipoDoc_x${i}" class="rf-x"></span>`).join('')
  const { page, doc, pulsar } = await pagina(`<div class="fila"><label id="IntervinientesBean$nifTomador_tipoDoc_label" class="rf-lbl">Tipo Doc. Tomador</label><div class="rf-sel" role="presentation" data-secreto="X"></div>${muchos}</div>
    <input id="IntervinientesBean$nifTomador_doc" value="12345678Z">`)
  const estado = await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar)
  assert.ok(estado === 'sin_opcion' || estado === 'sin_desplegable', estado)
  const d = await diagnosticoTipoDocumento(doc)
  assert.ok(d)
  assert.equal(d.base, 'IntervinientesBean$nifTomador_tipoDoc')
  assert.ok(d.elementos.length > 0 && d.elementos.length <= 15)
  assert.equal(d.elementos[0]!.rel, 'etiqueta')
  assert.ok(d.elementos.some((e) => e.clase === 'rf-sel' && e.role === 'presentation'))
  const plano = JSON.stringify(d) + lineaDiagnosticoTipoDoc(estado, d)
  assert.ok(!plano.includes('12345678Z') && !plano.includes('secreto') && !plano.includes('Tomador</'), 'sin valores ni atributos de datos')
  assert.ok(lineaDiagnosticoTipoDoc(estado, d).length <= 160)
  await page.close()
})

// 0.3.11 (Allianz real 28/10/2026): el <select> `_tipoDoc` existe pero sus opciones cargan al abrirse.
test('0.3.11 · select sin opciones hasta abrirlo: cae al widget con el pulsar guardado y elige NIF', async () => {
  const { page, doc, pulsar } = await pagina(`<label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo</label>
    <select id="IntervinientesBean$nifTomador_tipoDoc" aria-controls="lst2"></select>
    <ul id="IntervinientesBean$nifTomador_tipoDoc_lista"><li>CIF</li><li>NIF</li></ul>
    <input id="IntervinientesBean$nifTomador_doc">
    <script>for (const l of document.querySelectorAll('li')) l.addEventListener('click', () => { document.body.dataset.eleg = l.textContent })</script>`)
  assert.equal(await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar), 'elegido')
  assert.equal(await page.evaluate(() => document.body.dataset.eleg), 'NIF')
  await page.close()
})

test('0.3.11 · sin opción tras el widget: catálogo (nº y textos ≤10×30) sin textos que parezcan documento o fecha', async () => {
  const opts = ['Pasaporte', 'NIE', '12345678Z', '01/02/1990', 'X'.repeat(50), ...Array.from({ length: 12 }, (_, i) => `Tipo${i}`)]
  const { page, doc, pulsar } = await pagina(`<label id="IntervinientesBean$nifTomador_tipoDoc_label">Tipo</label>
    <select id="IntervinientesBean$nifTomador_tipoDoc">${opts.map((o) => `<option>${o}</option>`).join('')}</select>
    <input id="IntervinientesBean$nifTomador_doc">`)
  const estado = await elegirTipoDocumentoPareado(page.mainFrame(), doc, 'NIF', pulsar)
  assert.equal(estado, 'sin_opcion')
  const linea = lineaCatalogoTipoDoc(await catalogoTipoDocumento(doc))!
  assert.match(linea, /17 opciones/)
  assert.match(linea, /Pasaporte \| NIE/)
  assert.ok(!/12345678Z|01\/02\/1990/.test(linea), linea)
  assert.ok(!linea.includes('X'.repeat(31)), linea)
  assert.equal(linea.split('|').length, 3) // Pasaporte | NIE | XXX…; «Tipo0…Tipo11» llevan dígito y se descartan
  assert.equal(lineaCatalogoTipoDoc(null), null)
  await page.close()
})

test('lineaCatalogoTipoDoc: descarta opciones con dígitos o con aspecto de dato personal; NIF y Pasaporte se quedan', () => {
  const linea = lineaCatalogoTipoDoc(['NIF', 'Pasaporte', '12.345.678-Z', 'AB 123 45'])!
  assert.match(linea, /4 opciones \[NIF \| Pasaporte\]/)
  assert.ok(!/12\.345|AB 123/.test(linea), linea)
})
