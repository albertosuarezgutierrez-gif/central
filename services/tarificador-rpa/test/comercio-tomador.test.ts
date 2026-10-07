// Allianz Negocio 2038, paso 4 «Datos» + lector de prima: fixture SINTÉTICA (estructura inventada con los ids del mapa;
// valores ficticios; no es HTML real del portal).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { allianzComercio, COMERCIO_ACTIVO, ErrorMapaIncompleto, fijarSelectOculto, leerPrimaPanel, planTomador, primaDesdeTextos, rellenarTomador } from '../src/adapters/allianz/comercio.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { comprobarBoton, EmisionBloqueadaError, type Tomador } from '@central/module-tarificacion'

const fisica: Tomador = { tipo: 'fisica', nombre: 'Ana', apellido1: 'Prueba', apellido2: null, razonSocial: null, documentoIdentidad: '12345678Z', fechaNacimiento: '1980-05-17', codigoPostal: '41003', poblacion: 'Sevilla', direccion: 'Calle Ficticia', telefono: '600112233', email: 'ana@ejemplo.test' }
const juridica: Tomador = { tipo: 'juridica', nombre: null, apellido1: null, apellido2: null, razonSocial: 'Ejemplo SL', documentoIdentidad: 'B12345674', fechaNacimiento: null, codigoPostal: null, poblacion: null, direccion: null, telefono: null, email: null }

const HTML = (doc = '12345678Z') => `<body><form id="oForm">
<select id="idNumberTom_tipoDoc" disabled><option value="">=</option></select><input id="idNumberTom_doc" disabled value="${doc}">
<input id="razonSocialTom"><input id="nombreTom"><input id="apellido1Tom"><input id="apellido2Tom"><input id="fNaciTom">
<input id="Tom_address_pc"><input id="Tom_address_town"><input id="Tom_address_street"><input id="mailTom"><input id="telefono1Tom">
<div class="bootstrap-select"><select id="comboIdioma" style="display:none"><option value="E">Castellano</option><option value="C">Catalán</option></select><button class="dropdown-toggle">Castellano</button></div>
<button id="preguntaInfoPromos_S" type="button" onclick="window.rgpd=(window.rgpd||0)+1">Sí</button>
<button id="idbtnAceptar" type="button" onclick="window.siguiente=1">Siguiente</button>
</form>
<div class="alz-presupuesto"><div class="alz-presupuesto-seguro">Básico</div><div class="alz-presupuesto-precio"><span>922,91€</span></div></div></body>`

test('planTomador: física escribe nombre/apellidos/fecha dd/mm/aaaa; jurídica solo razón social; nada de null', () => {
  assert.deepEqual(planTomador(fisica).map(([s]) => s), ['#nombreTom', '#apellido1Tom', '#fNaciTom', '#Tom_address_pc', '#Tom_address_town', '#Tom_address_street', '#mailTom', '#telefono1Tom'])
  assert.deepEqual(planTomador(fisica).find(([s]) => s === '#fNaciTom'), ['#fNaciTom', '17/05/1980'])
  assert.deepEqual(planTomador(juridica), [['#razonSocialTom', 'Ejemplo SL']])
})

test('primaDesdeTextos: formato español → número; fail-closed', () => {
  assert.equal(primaDesdeTextos(['922,91€']), 922.91)
  assert.equal(primaDesdeTextos(['1.234,50 €', '/ año']), 1234.5)
  for (const t of [[], ['n/d'], ['10,00', '20,00'], ['0,00']]) {
    assert.throws(() => primaDesdeTextos(t), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
  }
})

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
after(async () => {
  await browser?.close()
})

test('leerPrimaPanel lee el panel', async () => {
  await page.setContent(HTML())
  assert.equal(await leerPrimaPanel(page), 922.91)
})

test('rellenarTomador escribe los campos y NO toca RGPD ni «Siguiente»', async () => {
  await page.setContent(HTML())
  await rellenarTomador(page, fisica)
  assert.equal(await page.inputValue('#nombreTom'), 'Ana')
  assert.equal(await page.inputValue('#fNaciTom'), '17/05/1980')
  assert.equal(await page.inputValue('#mailTom'), 'ana@ejemplo.test')
  assert.equal(await page.inputValue('#razonSocialTom'), '')
  assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).rgpd ?? null), null)
  assert.equal(await page.evaluate(() => (window as unknown as Record<string, unknown>).siguiente ?? null), null)
})

test('rellenarTomador: documento precargado distinto → error datos; campo ausente → portal', async () => {
  await page.setContent(HTML('87654321X'))
  await assert.rejects(rellenarTomador(page, fisica), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
  await page.setContent('<body><input id="idNumberTom_doc" disabled value=""></body>')
  await assert.rejects(rellenarTomador(page, juridica), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
})

test('fijarSelectOculto opera sobre el <select> oculto', async () => {
  await page.setContent(HTML())
  await fijarSelectOculto(page.locator('#comboIdioma'), 'C')
  assert.equal(await page.inputValue('#comboIdioma'), 'C')
  await assert.rejects(fijarSelectOculto(page.locator('#comboIdioma'), 'ZZ'), (e) => e instanceof ErrorTarificador && e.tipo === 'datos')
})

test('el guard bloquea «Siguiente» (#idbtnAceptar) incluso con el permiso de «Aceptar»', () => {
  assert.throws(() => comprobarBoton(['Siguiente', 'idbtnAceptar'], { permitirAceptar: true }), EmisionBloqueadaError)
})

test('el adaptador no está activo y tarificar deja el hueco de los pasos 1-3', () => {
  assert.equal(COMERCIO_ACTIVO, false)
  assert.equal(allianzComercio.ramo, 'comercio')
  assert.ok(ErrorMapaIncompleto.prototype instanceof ErrorTarificador)
})
