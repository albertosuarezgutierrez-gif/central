// Pestaña Tarificar (06/10/2026): cada importe va en una tabla ANIDADA; `leerPrimas` solo debe contar los td hijos directos.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { importePuntoDecimal } from '@central/module-tarificacion'
import { leerPrimas, type Raiz } from '../src/adapters/allianz/comunidades.ts'

const celda = (f: number, c: number, v: string) =>
  `<td id="tablaTarificacion_modelData_${f}_${c}"><table><tr><td></td><td id="valor_${c}${f}">${v}</td></tr></table></td>`
const fila = (i: number, et: string, a: string, s: string) => `<tr id="row_tablaTarificacion_${i}"><td><b>${et}</b></td>${celda(i, 0, a)}${celda(i, 1, s)}</tr>`
const TABLA = `<body><table id="tablaTarificacion"><tr><th></th><th id="head_tablaTarificacion_0">Anual</th><th id="head_tablaTarificacion_1">Sucesivos</th></tr>
${fila(0, 'Prima&nbsp;Neta', '295.88', '300.00')}${fila(1, 'Impuestos', '46.89', '47.55')}${fila(2, 'Prima&nbsp;Total', '342.77', '347.55')}</table></body>`

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
  page.setDefaultTimeout(3_000)
})
after(async () => browser?.close())

test('importePuntoDecimal: punto decimal, sin confundir miles', () => {
  assert.equal(importePuntoDecimal('342.77'), 342.77)
  assert.equal(importePuntoDecimal(' 300.00 € '), 300)
  assert.equal(importePuntoDecimal('1234.5'), 1234.5)
  assert.equal(importePuntoDecimal('1.234'), null) // 3 decimales: miles, no se afirma
  assert.equal(importePuntoDecimal('1.234,56'), null) // formato español: no es de esta tabla (ahí va importeEs)
})

test('leerPrimas: tabla con importes en tablas anidadas', async () => {
  await page.setContent(TABLA)
  const p = await leerPrimas(page as unknown as Raiz)
  assert.deepEqual(p.anual, { primaNetaEur: 295.88, impuestosEur: 46.89, primaTotalEur: 342.77 })
  assert.deepEqual(p.sucesivos, { primaNetaEur: 300, impuestosEur: 47.55, primaTotalEur: 347.55 })
})
