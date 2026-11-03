// Generali Turismos v0.2.37 (27/10/2026, prueba real con 0.2.36): «Garantías y Resultados» traía la cabecera de «Modalidades de Seguro» (9 columnas) con una sola fila propia (el paginador),
// 2 tablas en el marco y ningún importe tras 30 s. Hipótesis (a): el cuerpo del grid está en OTRA tabla o en filas con id «gridmodseg» fuera del thead. Ahora el lector las mira
// (solo filas con cifra con forma de importe) y el diagnóstico describe la segunda tabla. Hipótesis (b)/(c) NO se actúan. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { leerModalidadesGenerali, resumenDiagnosticoModalidadesGenerali } from '../src/adapters/generali/reglas.ts'
import { VERSION_GENERALI_AUTO, volcarDiagnosticoModalidadesGenerali, volcarModalidadesGenerali } from '../src/adapters/generali/auto.ts'

test('v0.2.37 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[7-9]|[4-9]\d)$/)
})

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
after(async () => {
  await browser?.close()
})

const SEL = 'ra' + 'dio'
const HEAD = '<thead class="maintenanceTableSumm"><tr><th id="reg1063E_gridmodseg_c0"></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr></thead>'
const PAGINADOR = '<tr><td colspan="5">&lt;&lt; anterior siguiente &gt;&gt;</td></tr>'
const fila = (nombre: string, ra: string, id = '', marcada = true) => `<tr${id ? ` id="${id}"` : ''}><td></td><td><input type="${SEL}" name="m"${marcada ? ' checked' : ''}></td><td>${nombre}</td><td>${ra}</td><td>900,00</td></tr>`

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body><h3>Garantías y Resultados</h3>${html}</body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.37 · (a) el cuerpo está en una SEGUNDA tabla ANTERIOR de otra clase: se lee el precio', async () => {
  const html = `<table class="maintenanceTable"><tbody>${fila('Todo Riesgo', '456,78')}</tbody></table><table class="maintenanceTableSumm">${HEAD}<tbody>${PAGINADOR}</tbody></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.equal(v!.filas.length, 1, JSON.stringify(v))
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') assert.equal(l.eur, 456.78)
})

test('v0.2.37 · (a) filas con id «gridmodseg» fuera del thead (tbody hermano en otra tabla): se leen, sin paginador', async () => {
  const html = `<table class="maintenanceTableSumm">${HEAD}<tbody>${PAGINADOR}</tbody></table><table><tbody id="reg1063E_gridmodseg_body">${fila('Todo Riesgo', '321,00', 'reg1063E_gridmodseg_r0').replace(/<input[^>]*>/, '')}</tbody></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.equal(v!.filas.length, 1, JSON.stringify(v))
  assert.match(v!.forma ?? '', /gridmodseg fuera 1/)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo === 'unico' && l.eur, 321)
})

test('v0.2.37 · una segunda tabla SIN importes no inventa filas', async () => {
  const html = `<table class="maintenanceTableSumm">${HEAD}<tbody>${PAGINADOR}</tbody></table><table class="maintenanceTable"><tbody><tr><td>Comparar</td><td>Volver</td></tr></tbody></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.ok(v?.encontrada)
  assert.equal(v!.filas.length, 0)
})

test('v0.2.37 · diagnóstico: segunda tabla (clase, filas, celdas, importes) y gridmodseg fuera del thead, sin textos', async () => {
  const html = `<table class="maintenanceTableSumm">${HEAD}<tbody>${PAGINADOR}</tbody></table><table class="maintenanceTable"><tbody><tr id="reg1063E_gridmodseg_r0"><td>Texto privado</td><td>12,50</td><td></td></tr><tr><td>x</td><td>y</td><td>z</td></tr></tbody></table>`
  const d = await conPagina(html, volcarDiagnosticoModalidadesGenerali)
  assert.equal(d.length >= 1, true)
  const r = resumenDiagnosticoModalidadesGenerali(d, 1_500)
  assert.match(r, /2ª\[maintenanceTable tbody=2 filas=2 celdas=3,3 imp=1\]/)
  assert.match(r, /gridmodseg-fuera=1\(reg1063E_gridmodseg_\)/)
  assert.doesNotMatch(r, /Texto privado/)
})

test('v0.2.37 · resumen sin segunda tabla ni campos nuevos: igual que antes', () => {
  const r = resumenDiagnosticoModalidadesGenerali([{ url: 'https://p.example/a.do', tablas: 2, conRecibo: 1, estructura: '' }], 500)
  assert.equal(r, 'Marcos (1): [0] /a.do tablas=2 con-Recibo/Prima=1')
})
