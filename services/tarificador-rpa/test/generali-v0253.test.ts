// Generali Turismos v0.2.53 (28/10/2026): DIAGNÓSTICO de «Tipo de vehículo» (`wclasv`) vacío, solo lectura y sin clics nuevos:
// 1) `nomiag` (nombre gris del mediador) tras teclear el código: solo «con valor»/«vacío», NUNCA el nombre; 2) `wclasv`/`wclavh` tras el selector,
// antes de «Personas» y al final; 3) opciones de TIPO/SUBTIPO del selector y la marcada. Todo va en una línea «diag:» del mensaje del atasco.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, diagGeneraliDe, fotografiarSelectorGenerali, hastaPrecioGenerali, leerClaseTipoGenerali, leerNomiagGenerali } from '../src/adapters/generali/auto.ts'
import { estadoNomiagGenerali, lineaDiagTipoVehiculoGenerali } from '../src/adapters/generali/reglas.ts'
import { validarFormularioAuto, type FormularioAuto } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.53 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.53'))

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

const P = 'reg1063A_vehiculo_caracVehiculo_'
const bloque = (id: string, rotulo: string, controles: string) =>
  `<div class="falseInline simple container500" id="${P}${id}Identification"><div class="falseInline column1"><span>${rotulo}</span><div class="trueInline required"><span> * </span></div></div><div class="falseInline column2">${controles}</div></div>`
const protegido = (id: string, valor: string) => `<input type="text" name="${P}${id}" value="${valor}" readonly="readonly" class="protegidoState" id="${P}${id}">`
const VALORACION = `<fieldset><legend><span>Características del vehículo</span></legend>${bloque('wclavh', 'Clase de vehículo', protegido('wclavh', 'TURISMO'))}${bloque('wclasv', 'Tipo de vehículo', protegido('wclasv', ''))}</fieldset><h3>Identificación del vehículo</h3>`
const NOMBRE = 'ACME CORREDURIA DEMO SL'
const nomiag = (v: string) => `<input type="text" id="nomiag" name="nomiag" value="${v}" readonly>`
const SELECTOR = `<h2>Selector de vehículos</h2>
  <div><div>Tipo de Vehículo</div><button class="ui-state-active">Turismo</button><button>Moto</button></div>
  <div><div>Subtipo de Vehículo</div><button>Turismos</button><button class="ui-state-highlight">Todoterreno</button></div>`

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

test('v0.2.53 · nomiag: solo «con valor»/«vacío»/«sin campo», nunca el nombre', async () => {
  assert.equal(estadoNomiagGenerali(NOMBRE), 'con valor')
  assert.equal(estadoNomiagGenerali('  '), 'vacío')
  assert.equal(estadoNomiagGenerali(null), 'sin campo')
  await conPagina(nomiag(NOMBRE), async (page) => assert.equal(await leerNomiagGenerali(page), 'con valor'))
  await conPagina(nomiag(''), async (page) => assert.equal(await leerNomiagGenerali(page), 'vacío'))
  await conPagina('<p>nada</p>', async (page) => assert.equal(await leerNomiagGenerali(page), 'sin campo'))
  // Aunque alguien meta el nombre en la medición, la línea del atasco no lo deja pasar.
  assert.doesNotMatch(lineaDiagTipoVehiculoGenerali({ nomiag: NOMBRE }), /ACME/)
  assert.match(lineaDiagTipoVehiculoGenerali({ nomiag: NOMBRE }), /nomiag=¿\?/)
})

test('v0.2.53 · la foto del selector añade las opciones de TIPO y SUBTIPO y la marcada', async () => {
  await conPagina(SELECTOR, async (page) => {
    const foto = await fotografiarSelectorGenerali(page, page)
    assert.match(foto, /tipos=\[Turismo \| Moto\] \(marcado «Turismo»\); subtipos=\[Turismos \| Todoterreno\] \(marcado «Todoterreno»\)/)
    assert.match(diagGeneraliDe(page).subtipos ?? '', /subtipos=\[Turismos \| Todoterreno\]/)
  })
})

test('v0.2.53 · wclasv/wclavh se leen como catálogo (vacío / valor)', async () => {
  await conPagina(VALORACION, async (page) => assert.equal(await leerClaseTipoGenerali(page), 'vacío (wclavh «TURISMO»)'))
})

test('v0.2.53 · el mensaje del atasco de «Tipo de vehículo» lleva la línea «diag:» con las mediciones y sin el nombre del mediador', async () => {
  await conPagina(SELECTOR + nomiag(NOMBRE), async (page) => {
    await fotografiarSelectorGenerali(page, page)
    diagGeneraliDe(page).nomiag = await leerNomiagGenerali(page)
    diagGeneraliDe(page).trasSelector = await leerClaseTipoGenerali(page)
    await page.setContent(`<html><body>${VALORACION}${nomiag(NOMBRE)}</body></html>`)
    const c = { pausaAccion: async () => {}, pulsarSubpestanaGenerali: async () => {} } as unknown as ContextoPortal
    await assert.rejects(hastaPrecioGenerali(page, formulario(), [], c, { esperaPrecioMs: 300, esperaProtegidosMs: 300, pruebasTipo: { trasAccionMs: 300, selectorMs: 200 } }), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali, String(e))
      const m = (e as Error).message
      assert.match(m, /diag: nomiag=con valor; wclasv tras selector=sin campo \(wclavh sin campo\)\/antes personas=vacío \(wclavh «TURISMO»\)\/final=vacío \(wclavh «TURISMO»\); tipos=\[Turismo \| Moto\] \(marcado «Turismo»\); subtipos=\[Turismos \| Todoterreno\] \(marcado «Todoterreno»\)/)
      assert.doesNotMatch(m, /ACME/)
      return true
    })
  })
})
