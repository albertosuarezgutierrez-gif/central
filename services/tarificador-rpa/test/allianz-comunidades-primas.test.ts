// Lectura de «Prima Total» de Allianz Comunidades (14/10/2026): espera robusta, importe español, texto en otro nodo y
// mensaje del portal en vez de prima → ErrorPrimaIlegible con texto visible SIN datos personales.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorPrimaIlegible, esperarPrimas, importePrima, textoVisibleSeguro } from '../src/adapters/allianz/comunidades.ts'

const celda = (f: number, c: number, v: string) => `<td id="tablaTarificacion_modelData_${f}_${c}"><table><tr><td></td><td id="valor_${c}${f}">${v}</td></tr></table></td>`
const fila = (i: number, et: string, a: string, s: string) => `<tr><td><b>${et}</b></td>${celda(i, 0, a)}${celda(i, 1, s)}</tr>`
const tabla = (a: string, s: string) => `<table id="t">${fila(0, 'Prima&nbsp;Neta', '1', '1')}${fila(1, 'Impuestos', '1', '1')}${fila(2, 'Prima&nbsp;Total', a, s)}</table>`

let browser: Browser
let page: Page
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
  page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
})
after(async () => browser?.close())

test('importePrima: punto decimal y español con coma; «1.234» sigue sin afirmarse', () => {
  assert.equal(importePrima('342.77'), 342.77)
  assert.equal(importePrima('1.234,56 €'), 1234.56)
  assert.equal(importePrima('1.234,56 €'), 1234.56)
  assert.equal(importePrima('347,55'), 347.55)
  assert.equal(importePrima('1.234'), null)
  assert.equal(importePrima('Incluida'), null)
  assert.equal(importePrima(''), null)
})

test('espera: la fila «Prima Total» existe VACÍA y el importe llega después → se espera y se lee', async () => {
  await page.setContent(tabla('', ''))
  await page.evaluate(() => {
    setTimeout(() => {
      document.getElementById('valor_02')!.textContent = '342.77'
      document.getElementById('valor_12')!.textContent = '347.55'
    }, 1_500)
  })
  const r = await esperarPrimas(page, 8_000)
  assert.equal(r.primas.anual.primaTotalEur, 342.77)
  assert.equal(r.primas.sucesivos.primaTotalEur, 347.55)
})

test('importes en español «1.234,56 €» en la tabla', async () => {
  await page.setContent(tabla('1.234,56 €', '1.300,00 €'))
  const r = await esperarPrimas(page, 3_000)
  assert.equal(r.primas.anual.primaTotalEur, 1234.56)
  assert.equal(r.primas.sucesivos.primaTotalEur, 1300)
})

test('importes en otro nodo (sin ids ni tablas anidadas): respaldo por el texto de la fila', async () => {
  await page.setContent('<table><tr><td>Prima Total</td><td><div><span>342,77 €</span></div></td><td><div><span>347,55 €</span></div></td></tr></table>')
  const r = await esperarPrimas(page, 3_000)
  assert.equal(r.primas.anual.primaTotalEur, 342.77)
})

test('varias primas / opciones (más de dos importes en la fila): no se afirma ninguno', async () => {
  await page.setContent('<table><tr><td>Prima Total</td><td>1,00</td><td>2,00</td><td>3,00</td></tr></table>')
  await assert.rejects(() => esperarPrimas(page, 1_200), ErrorPrimaIlegible)
})

test('mensaje de error de Allianz en vez de prima → ErrorPrimaIlegible con el texto visible, sin PII', async () => {
  await page.setContent('<body><div class="error">Error: la tarifa no está disponible para esta comunidad</div><p>Tomador: Juan Pérez, juan@correo.es, DNI 12345678Z, tel 600123456</p></body>')
  await assert.rejects(
    () => esperarPrimas(page, 1_200),
    (e: unknown) => {
      assert.ok(e instanceof ErrorPrimaIlegible)
      assert.equal(e.tipo, 'portal')
      assert.equal(e.pideInventarioDom, true)
      assert.match(e.message, /tarifa no está disponible/)
      assert.doesNotMatch(e.message, /Juan|correo\.es|12345678Z|600123456/)
      return true
    },
  )
})

test('textoVisibleSeguro: enmascara correos y números largos', () => {
  const t = textoVisibleSeguro('Aviso: contacte con a@b.es o 123456789\nOtra línea sin interés')
  assert.equal(t, 'Aviso: contacte con [correo] o [nº]')
})

test('textoVisibleSeguro: redacta dentro de la línea nombre, fecha, NIF/CIF, teléfono y correo', () => {
  const t = textoVisibleSeguro('Error: el tomador Juan Pérez García con fecha 01/02/1980 no existe')
  assert.doesNotMatch(t, /Juan|Pérez|García|01\/02\/1980/)
  assert.match(t, /\[…\]/)
  const u = textoVisibleSeguro('Error: asegurado MARIA DE LA O LOPEZ, NIF 12345678Z, CIF B12345678, tel. 600 123 456, nacido 1980-02-01')
  assert.doesNotMatch(u, /MARIA|LOPEZ|12345678Z|B12345678|600 123|1980/)
  assert.doesNotMatch(u, /nº|Z\b|B\[/, 'NIF y CIF se redactan enteros, no a medias')
  assert.match(textoVisibleSeguro('Error: la prima total es 120,50'), /prima total es 120,50/)
})
