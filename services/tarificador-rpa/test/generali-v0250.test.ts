// Generali Turismos v0.2.50 (28/10/2026, prueba real con 0.2.49, trabajo 3bbecab7): tras el selector todo lo de solo lectura llega relleno salvo
// «Tipo de vehículo» (`wclasv`). El volcado no dice qué lo rellena: el bot FOTOGRAFÍA el selector antes de «Confirmar» (sin valores) y la foto va en
// la parada de «Datos de Valoración». Fixtures SINTÉTICAS (estructura PrimeFaces/Genernet).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, fotografiarSelectorGenerali, hastaPrecioGenerali } from '../src/adapters/generali/auto.ts'
import { resumenFotoSelectorGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.50 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.58'))

test('v0.2.50 · puro: la foto dice qué grupo está SIN marcar y lo pintado como activo (saneado, sin repetir)', () => {
  const f = resumenFotoSelectorGenerali({
    controles: [
      { clave: 'grupo|tipo', etiqueta: 'tipo', tipo: 'grupo', vacio: false, requerido: true },
      { clave: 'grupo|subtipo', etiqueta: 'subtipo', tipo: 'grupo', vacio: true, requerido: false },
      { clave: 'x', etiqueta: 'Matrícula', tipo: 'texto', vacio: false, requerido: false },
    ],
    filas: 0, filasSeleccionadas: 0,
  }, ['Turismo', 'Turismo', 'Turismos'])
  assert.equal(f, 'controles: tipo=marcado* · subtipo=SIN marcar; marcados en pantalla: «Turismo» · «Turismos»')
  assert.ok(!f.includes('Matrícula'), 'los textos no entran (solo grupos/desplegables)')
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
after(async () => { await browser?.close() })

const SELECTOR = `<h2>Selector de vehículos</h2>
  <div><input type="radio" name="tipo" id="tipo:0" checked><label for="tipo:0">Turismo</label></div>
  <div><input type="radio" name="subtipo" id="subtipo:0"><label for="subtipo:0">Turismos</label><input type="radio" name="subtipo" id="subtipo:1"><label for="subtipo:1">Comerciales</label></div>
  <div class="ui-state-active">Turismo</div><div class="ui-state-highlight">Turismos</div>`
const P = 'reg1063A_vehiculo_caracVehiculo_'
const bloque = (id: string, rotulo: string, controles: string) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"><div class="falseInline column1"><span>${rotulo}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const protegido = (id: string, valor: string) => `<input type="text" name="${P}${id}" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}">`
const VALORACION = `<fieldset><legend><span>Características del vehículo</span></legend>${bloque('wclavh', 'Clase de vehículo', protegido('wclavh', 'TURISMO'))}${bloque('wclasv', 'Tipo de vehículo', protegido('wclasv', ''))}</fieldset><h3>Identificación del vehículo</h3>`

function formulario(): FormularioAuto {
  const v = validarFormularioAuto({
    ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
    conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01' },
    tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: null, siniestrosUltimos5Anios: null, garajeNoche: null,
  })
  if (!v.ok) throw new Error(JSON.stringify(v))
  return v.formulario as FormularioAuto
}
async function conPagina(html: string, fn: (page: Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent(`<html><body>${html}</body></html>`)
    await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.50 · caso 3bbecab7: la parada por «Tipo de vehículo» vacío lleva la foto del selector tomada antes de «Confirmar»', async () => {
  await conPagina(SELECTOR, async (page) => {
    const foto = await fotografiarSelectorGenerali(page, page)
    assert.match(foto, /subtipo=SIN marcar/)
    assert.match(foto, /marcados en pantalla: «Turismo» · «Turismos»/)
    await page.setContent(`<html><body>${VALORACION}</body></html>`)
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => {} } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300 }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali, String(e))
      const m = (e as Error).message
      assert.match(m, /: Tipo de vehículo\. No se pasa/)
      assert.match(m, /Selector antes de «Confirmar» \(v0\.2\.50; ¿el subtipo «Turismos» llega marcado\?\): controles: tipo=marcado · subtipo=SIN marcar; marcados en pantalla: «Turismo» · «Turismos»/)
      return true
    })
  })
})

test('v0.2.50 · sin pasar por el selector, la parada lo dice (no inventa foto)', async () => {
  await conPagina(VALORACION, async (page) => {
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => {} } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300 }), /Selector antes de «Confirmar» .*: \(sin foto: no pasó por el selector PrimeFaces\)/)
  })
})
