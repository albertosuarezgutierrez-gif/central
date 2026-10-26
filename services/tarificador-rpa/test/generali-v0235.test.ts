// Generali Turismos v0.2.35 (26/10/2026, prueba real con 0.2.34): «Garantías y Resultados» (emiAutosGenB028.do) traía «Modalidades de Seguro» con UNA fila que era el
// paginador («<< anterior siguiente >> …») y ningún importe: las filas con precio llegan por carga asíncrona. Ahora: (1) se descarta la fila del paginador,
// (2) con la cabecera a la vista se sondea (todos los marcos) a que aparezca una fila con importe, (3) si no aparece, el error trae un diagnóstico ampliado
// (marcos, tablas, estructura saneada). Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { leerModalidadesGenerali, resumenDiagnosticoModalidadesGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, esperarModalidadesGenerali, hastaPrecioGenerali, volcarDiagnosticoModalidadesGenerali, volcarModalidadesGenerali } from '../src/adapters/generali/auto.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.35 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[5-9]|[4-9]\d)$/)
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
const HEAD = '<tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr>'
const PAGINADOR = '<tr><td colspan="5">&lt;&lt; anterior siguiente &gt;&gt;</td></tr>'
const fila = (nombre: string, ra: string, marcada = false) => `<tr><td></td><td><input type="${SEL}" name="m"${marcada ? ' checked' : ''}></td><td>${nombre}</td><td>${ra}</td><td>900,00</td></tr>`

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

test('v0.2.35 · la fila del paginador no cuenta como modalidad', async () => {
  const solo = await conPagina(`<table>${HEAD}${PAGINADOR}</table>`, volcarModalidadesGenerali)
  assert.ok(solo?.encontrada)
  assert.equal(solo!.filas.length, 0, JSON.stringify(solo!.filas))
  const con = await conPagina(`<table>${HEAD}${fila('Todo Riesgo', '456,78', true)}${PAGINADOR}</table>`, volcarModalidadesGenerali)
  assert.equal(con!.filas.length, 1)
  const l = leerModalidadesGenerali(con!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') assert.equal(l.eur, 456.78)
})

test('v0.2.35 · las filas con importe llegan DESPUÉS (carga asíncrona): se sondea y se leen', async () => {
  const html = `<table id="t">${HEAD}${PAGINADOR}</table><script>setTimeout(function(){document.getElementById('t').insertAdjacentHTML('beforeend', ${JSON.stringify(fila('Todo Riesgo', '456,78', true))})}, 1500)</script>`
  const v = await conPagina(html, (page) => esperarModalidadesGenerali(page, 8_000))
  assert.equal(v?.filas.length, 1)
  assert.equal(leerModalidadesGenerali(v!.filas).tipo, 'unico')
})

test('v0.2.35 · sin cabecera de modalidades NO se espera; con cabecera y sin importes espera el máximo y devuelve lo último', async () => {
  const t0 = Date.now()
  const sin = await conPagina('<p>otra pantalla</p>', (page) => esperarModalidadesGenerali(page, 5_000))
  assert.equal(sin, null)
  assert.ok(Date.now() - t0 < 3_000)
  const t1 = Date.now()
  const v = await conPagina(`<table>${HEAD}${PAGINADOR}</table>`, (page) => esperarModalidadesGenerali(page, 1_200))
  assert.ok(v?.encontrada)
  assert.equal(v!.filas.length, 0)
  assert.ok(Date.now() - t1 >= 1_000)
})

test('v0.2.35 · diagnóstico ampliado: marcos, tablas y estructura sin textos ajenos a cabeceras e importes', async () => {
  const html = `<table class="lista">${HEAD}${PAGINADOR}<tr><td>Nombre Secreto Persona</td><td>1.234,56</td></tr></table>`
  const d = await conPagina(html, volcarDiagnosticoModalidadesGenerali)
  assert.equal(d.length, 1)
  assert.equal(d[0]!.tablas, 1)
  assert.equal(d[0]!.conRecibo, 1)
  assert.ok(d[0]!.estructura.length > 0 && d[0]!.estructura.length <= 600)
  assert.match(d[0]!.estructura, /<table class=lista>/)
  assert.match(d[0]!.estructura, /Modalidades de Seguro/)
  assert.match(d[0]!.estructura, /1\.234,56/)
  assert.doesNotMatch(d[0]!.estructura, /Secreto|anterior/)
  const r = resumenDiagnosticoModalidadesGenerali([{ url: 'https://portal.example/app/emi.do', tablas: 3, conRecibo: 1, estructura: '<table></table>' }], 300)
  assert.match(r, /^Marcos \(1\): \[0\] \/app\/emi\.do tablas=3 con-Recibo\/Prima=1 estructura: <table><\/table>$/)
  assert.ok(resumenDiagnosticoModalidadesGenerali([{ url: 'x', tablas: 1, conRecibo: 0, estructura: 'a'.repeat(900) }], 200).length <= 200)
})

test('v0.2.35 · hastaPrecioGenerali: sin importes el error trae el diagnóstico ampliado', async () => {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => ({}) } as unknown as ContextoPortal
  await conPagina(`<table>${HEAD}${PAGINADOR}</table>`, async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, v.formulario as FormularioAuto, [], ctx, { esperaPrecioMs: 300 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /Marcos \(1\): \[0\] .*tablas=1 con-Recibo\/Prima=1 estructura: <table>/, e.message)
      return true
    })
  })
})
