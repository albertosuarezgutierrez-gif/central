// Generali Turismos v0.2.34 (26/10/2026, prueba real con 0.2.33): «Garantías y Resultados» (emiAutosGenB028.do) trae la tabla «Modalidades de Seguro» y el lector
// decía «sin filas» (cabecera y cuerpo en tablas distintas / celdas combinadas / campos de otro tipo), y el 2.º «Siguiente» lo cortó el escaneo de emisión sin
// poder ver QUÉ texto casó. Ahora: (1) lector tolerante (tablas anidadas/hermanas, colspan, cualquier tipo de campo, respaldo por cifras de la fila con aviso),
// (2) con la tabla a la vista NO se pulsa «Siguiente» aunque no se lea el precio, (3) el motivo cita la LÍNEA que casó. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { leerModalidadesGenerali, resumenModalidadesGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, hastaPrecioGenerali, volcarModalidadesGenerali } from '../src/adapters/generali/auto.ts'
import { casaEmisionGenerali } from '../src/guard.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.34 · versión', () => {
  assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(3[4-9]|[4-9]\d)$/)
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
const CAB = '<h3>Garantías y Capitales opcionales</h3>'
const HEAD = '<tr><th></th><th>#</th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>1er. Recibo Semestral</th><th>1er. Recibo Trimestral</th><th>Prima Anualidad</th><th>1er. Recibo</th></tr>'
const BOTONES = '<input type="button" id="btnComparar" value="Comparar"><input type="button" id="btnSig" value="Siguiente ›">'
const sel = (marcada: boolean) => `<input type="${SEL}" name="m"${marcada ? ' checked' : ''}>`
/** Fila de 8 celdas con las cifras como TEXTO plano sin «€» ni coma (formato 1234.56). */
const filaTexto = (nombre: string, ra: string, marcada = false) => `<tr><td></td><td>${sel(marcada)}</td><td>${nombre}</td><td>${ra}</td><td>0.00</td><td>0.00</td><td>900.00</td><td>0.00</td></tr>`

async function conPagina<T>(html: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${CAB}${html}${BOTONES}</body></html>`)
    return await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.34 · cabecera en una tabla y el cuerpo en otra HERMANA → se leen las filas y el precio', async () => {
  const html = `<table>${HEAD}</table><table>${filaTexto('Terceros Ampliado', '321.50')}${filaTexto('Todo Riesgo', '456.78', true)}</table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.ok(v?.encontrada)
  assert.equal(v!.filas.length, 2)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') assert.equal(l.eur, 456.78)
})

test('v0.2.34 · el cuerpo en una tabla ANIDADA dentro de la fila siguiente a la cabecera', async () => {
  const html = `<table>${HEAD}<tr><td colspan="8"><table>${filaTexto('Todo Riesgo Franquicia', '1.234,56', true)}</table></td></tr></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') assert.equal(l.eur, 1234.56)
})

test('v0.2.34 · celdas combinadas (la fila tiene menos celdas que la cabecera): respaldo por la primera cifra de la fila, con aviso', async () => {
  const html = `<table>${HEAD}<tr><td colspan="2">${sel(true)}</td><td>Todo Riesgo</td><td>456,78</td><td>900,00</td></tr></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.equal(v!.filas.length, 1)
  assert.equal(v!.filas[0]!.porFila, true)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') {
    assert.equal(l.eur, 456.78)
    assert.ok(l.avisos?.some((a) => /primera cifra de la fila/.test(a)), JSON.stringify(l.avisos))
  }
})

test('v0.2.34 · campos tipo «tel» (antes ignorados) y colspan en la cabecera: la columna se calcula por posición real', async () => {
  const head = '<tr><th colspan="2"></th><th>Modalidades de Seguro</th><th>Recibo Anual</th><th>Prima Anualidad</th></tr>'
  const fila = '<tr><td></td><td></td><td>Todo Riesgo</td><td><input type="tel" value="512,34"></td><td>999,00</td></tr>'
  const v = await conPagina(`<table>${head}${fila}</table>`, volcarModalidadesGenerali)
  const l = leerModalidadesGenerali(v!.filas)
  assert.equal(l.tipo, 'unico')
  if (l.tipo === 'unico') assert.equal(l.eur, 512.34)
})

test('v0.2.34 · una tabla hermana SIN control de elegir (p. ej. franquicias) no se toma por modalidades', async () => {
  const html = `<table>${HEAD}</table><table><tr><td>Franquicia</td><td>150,00</td></tr></table>`
  const v = await conPagina(html, volcarModalidadesGenerali)
  assert.equal(v!.filas.length, 0)
  assert.equal(leerModalidadesGenerali(v!.filas).tipo, 'ninguno')
  assert.match(resumenModalidadesGenerali(v), /sin filas \[forma: cab 8c;/, resumenModalidadesGenerali(v))
})

test('v0.2.34 · hastaPrecioGenerali: con la tabla a la vista y sin cifras NO pulsa «Siguiente» y el diagnóstico trae la forma de la tabla', async () => {
  const coche = (): FormularioAuto => {
    const v = validarFormularioAuto({
      ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
      conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
      tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
    })
    if (!v.ok) throw new Error(JSON.stringify(v))
    return v.formulario as FormularioAuto
  }
  let siguientes = 0
  const ctx = { pulsarSubpestanaGenerali: async () => {}, pulsarSiguienteGenerali: async () => { siguientes++; return {} } } as unknown as ContextoPortal
  await conPagina(`<table>${HEAD}</table><table><tr><td>${sel(false)}</td><td>Todo Riesgo</td><td>consultar</td></tr></table>`, async (page) => {
    await assert.rejects(hastaPrecioGenerali(page, coche(), [], ctx, { esperaPrecioMs: 300 }), (e: unknown) => {
      if (!(e instanceof ErrorMapaIncompletoGenerali)) return false
      assert.match(e.message, /no intentado: la tabla de modalidades ya está a la vista/, e.message)
      assert.match(e.message, /forma: cab 8c;/, e.message)
      return true
    })
  })
  assert.equal(siguientes, 0)
})

test('v0.2.34 · pura: el motivo del guard cita la LÍNEA donde casó (no cruza saltos de línea) y enmascara cifras largas', () => {
  const t = 'Cabecera previa\nNota informativa 12345678 para poder contratar mañana el seguro\nSiguiente ›'
  const c = casaEmisionGenerali(t)!
  assert.match(c, /^«contratar» en «…nota informativa # para poder contratar manana el seguro…»$/, c)
  assert.doesNotMatch(c, /cabecera previa|siguiente/)
  assert.equal(casaEmisionGenerali('Prima Anualidad 1er. Recibo'), null)
})
