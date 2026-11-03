// Explorador 0.3.36 (Alberto, 03/11/2026): el guard se parte en dos para el EXPLORADOR. (A) NAVEGACIÓN LIBRE: la IA puede pulsar controles de
// navegación (menú, tarjeta `a.card` sin href, enlace, pestaña, «Siguiente/Buscar…») sin lista por compañía si nada de lo que los describe
// nombra una acción final. (B) EMISIÓN BLOQUEADA igual que hoy. Fixtures SINTÉTICAS (sin PII), portal por `page.route`. Un brazo por aserción.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import {
  navegacionLibre,
  navegacionLibreInventario,
  requiereNavegacionLibre,
  sanearInventarioDom,
  validarRespuestaExplorador,
  type ControlNavegacion,
  type InventarioDom,
} from '@central/module-tarificacion'
import { ErrorFronteraEmision, instalarGuardEmision, motivoNoNavegacionLibreVivo, pulsarNavegacionLibre, topeNavegacionLibre, type GuardEmision } from '../src/guard.ts'
import { casaBloqueoNavegacion } from '../src/vocabulario.ts'

const PELAYO = 'https://mediadores.pelayo.com'
const FIDE = 'https://mediadores.fidelidade.es'
const E_PELAYO = 'pelayo:presupuestos:auto'
const E_FIDE = 'fidelidade:particulares:vivienda'
const URL_P = `${PELAYO}/portalmediador-nuevo-presupuesto/`
const URL_DOMICILIO = `${FIDE}/OPI_ES_Vivienda/Domicilio.aspx`

// ───────────────────────── puras: la regla del módulo sobre el inventario ─────────────────────────

function inv(url: string, el: Record<string, unknown>): InventarioDom {
  return sanearInventarioDom({ marcos: [{ url, nombre: 'm', elementos: [el] }] }, undefined, { refs: true })!
}
function validar(url: string, el: Record<string, unknown>, entrada = E_PELAYO) {
  const i = inv(url, el)
  const ref = i.marcos[0].elementos[0].ref!
  return validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'X', tipo: 'formulario' }, acciones: [{ accion: 'avanzar', ref, efectoEsperado: 'siguiente_pantalla', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo: 'auto', entrada, datosReales: null },
  )
}
const ok = (c: ControlNavegacion, url = URL_P) => navegacionLibre(c, { urlMarco: url }).ok

const CARD = { tag: 'a', clase: 'card', texto: 'AUTOS' }
const MENU = { tag: 'a', role: 'menuitem', texto: 'Contratación' }

test('pasa · tarjeta «AUTOS» `a.card` sin href: el validador la acepta (antes «no es un botón/pestaña»)', () => {
  assert.equal(validar(URL_P, CARD).ok, true)
})
test('pasa · la tarjeta va por la navegación libre (requiereNavegacionLibre)', () => {
  const i = inv(URL_P, CARD)
  assert.equal(requiereNavegacionLibre(E_PELAYO, i.marcos[0].elementos[0], i.marcos[0]), true)
})
test('pasa · menú «Contratación» role=menuitem sin onclick ni href', () => {
  assert.equal(validar(URL_P, MENU).ok, true)
})
test('pasa · menú «CONTRATACIÓN ▾» con clase dropdown-toggle y href="#" (ruta de la propia pantalla)', () => {
  assert.equal(validar(URL_P, { tag: 'a', clase: 'nav-link dropdown-toggle', texto: 'CONTRATACIÓN ▾', hrefRuta: '/portalmediador-nuevo-presupuesto/' }).ok, true)
})
test('pasa · «Buscar» (enlace OsAjax) en Fidelidade Domicilio.aspx', () => {
  assert.equal(validar(URL_DOMICILIO, { tag: 'a', id: 'wtButtonSearch', texto: 'Buscar', onclick: "OsAjax(arguments[0] || window.event,'wtButtonSearch','wtButtonSearch','','__OSVSTATE,',''); return false;" }, E_FIDE).ok, true)
})
test('pasa · «Siguiente ›» como enlace', () => {
  assert.equal(validar(URL_P, { tag: 'a', texto: 'Siguiente ›', hrefRuta: '/portalmediador-paso-2/' }).ok, true)
})
test('pasa · pestaña (role=tab) «Coberturas»', () => {
  assert.equal(ok({ tag: 'li', role: 'tab', texto: 'Coberturas' }), true)
})
test('pasa · acordeón `<summary>` «Más opciones»', () => {
  assert.equal(ok({ tag: 'summary', texto: 'Más opciones' }), true)
})

const bloquea = (nombre: string, c: ControlNavegacion, url = URL_P) =>
  test(`bloquea · ${nombre}`, () => assert.equal(ok(c, url), false))
bloquea('«Emitir»', { tag: 'a', texto: 'Emitir' })
bloquea('«EMITIR PÓLIZA»', { tag: 'a', texto: 'EMITIR PÓLIZA' })
bloquea('«Emisión» con tilde', { tag: 'a', texto: 'Emisión' })
bloquea('«  e m i s i ó n » con espacios y mayúsculas: «EMISIÓN   DE  PÓLIZA»', { tag: 'a', texto: 'EMISIÓN   DE  PÓLIZA' })
bloquea('«Contratar» botón', { tag: 'button', texto: 'Contratar' })
bloquea('«Contratar» aunque sea role=menuitem (el verbo nunca se exime)', { tag: 'a', role: 'menuitem', texto: 'Contratar' })
bloquea('«Contratación» como BOTÓN (no desplegable de menú)', { tag: 'button', texto: 'Contratación' })
bloquea('«Contratación» menuitem CON onclick', { tag: 'a', role: 'menuitem', texto: 'Contratación', onclick: 'abrir()' })
bloquea('«Contratación» menuitem con href real', { tag: 'a', role: 'menuitem', texto: 'Contratación', hrefRuta: '/portal/presupuestos/' })
bloquea('«Contratación» menuitem con id que contrata', { tag: 'a', role: 'menuitem', texto: 'Contratación', id: 'btnContratar' })
bloquea('«Confirmar»', { tag: 'button', texto: 'Confirmar' })
bloquea('«Firmar»', { tag: 'a', texto: 'Firmar' })
bloquea('«Pagar»', { tag: 'a', texto: 'Pagar' })
bloquea('«Guardar proyecto»', { tag: 'a', texto: 'Guardar proyecto' })
bloquea('botón «IBAN»', { tag: 'a', texto: 'Introducir IBAN' })
bloquea('«Solicitar»', { tag: 'a', texto: 'Solicitar' })
bloquea('«Aceptar condiciones»', { tag: 'a', texto: 'Aceptar condiciones' })
bloquea('«Domiciliar recibo» (no es «Domicilio»)', { tag: 'a', texto: 'Domiciliar recibo' })
bloquea('«Domicilio bancario»', { tag: 'a', texto: 'Domicilio bancario' })
bloquea('sin texto con aria-label «Emitir»', { tag: 'button', ariaLabel: 'Emitir' })
bloquea('texto neutro con title «Firmar»', { tag: 'a', texto: 'Ir', title: 'Firmar' })
bloquea('texto neutro con value «Pagar»', { tag: 'input', type: 'submit', value: 'Pagar' })
bloquea('texto neutro con clase btn-emitir', { tag: 'a', texto: 'Ir', clase: 'btn btn-emitir' })
bloquea('texto neutro con id doContratar', { tag: 'a', texto: 'Ir', id: 'doContratar' })
bloquea('texto neutro con onclick de emisión', { tag: 'a', texto: 'Ir', onclick: 'emitirPoliza()' })
bloquea('enlace de salida (logout)', { tag: 'a', texto: 'Ir', hrefRuta: '/logout' })
bloquea('enlace «Salir»', { tag: 'a', texto: 'Salir' })
bloquea('enlace a otro origen', { tag: 'a', texto: 'Ir', hrefRuta: 'https://otro.example.com/x' })
bloquea('submit a /contratacion', { tag: 'button', texto: 'Siguiente', accionFormulario: `${PELAYO}/contratacion/paso` })
bloquea('submit a /pago', { tag: 'button', texto: 'Siguiente', accionFormulario: `${PELAYO}/pago` })
bloquea('submit a otro origen', { tag: 'button', texto: 'Siguiente', accionFormulario: 'https://otro.example.com/x' })
bloquea('pantalla en ruta /pago', { tag: 'a', texto: 'Siguiente' }, `${PELAYO}/pago/paso1`)
bloquea('pantalla en ruta de contratación', { tag: 'a', texto: 'Siguiente' }, `${PELAYO}/portal/contratacion/x`)
bloquea('pantalla en ruta /checkout (pasarela de pago)', { tag: 'a', texto: 'Siguiente' }, `${PELAYO}/checkout/paso1`)
bloquea('sin descripción visible', { tag: 'a', clase: 'card' })
bloquea('descripción recortada («…»)', { tag: 'a', texto: 'Siguiente', onclick: 'ir(…' })
bloquea('un div (no es control de navegación)', { tag: 'div', texto: 'Siguiente' })

test('bloquea · el validador rechaza «Emitir» como enlace (no lo abre la navegación libre)', () => {
  assert.equal(validar(URL_P, { tag: 'a', texto: 'Emitir' }).ok, false)
})
test('bloquea · el validador rechaza «Contratar» role=menuitem', () => {
  assert.equal(validar(URL_P, { tag: 'a', role: 'menuitem', texto: 'Contratar' }).ok, false)
})
test('bloquea · el validador rechaza «Contratación» como botón (boton_de_emision sigue)', () => {
  assert.equal(validar(URL_P, { tag: 'button', texto: 'Contratación' }).ok, false)
})
test('bloquea · la excepción del menú «Contratación» no vale para guardar_presupuesto', () => {
  const i = inv(URL_P, MENU)
  const r = validarRespuestaExplorador(
    { version: 1, pantalla: { nombre: 'X', tipo: 'resultado' }, acciones: [{ accion: 'avanzar', ref: i.marcos[0].elementos[0].ref!, efectoEsperado: 'guardar_presupuesto', confianza: 'alta' }], mapeo: [], motivo: null },
    { inventario: i, ramo: 'auto', entrada: E_PELAYO, datosReales: null },
  )
  assert.equal(r.ok, false)
})
test('el inventario de la tarjeta: exentoMenu false (solo un desplegable exime)', () => {
  const i = inv(URL_P, CARD)
  assert.deepEqual(navegacionLibreInventario(i.marcos[0].elementos[0], i.marcos[0]), { ok: true, exentoMenu: false })
})

// ───────────────────────── vocabulario del worker ─────────────────────────

test('vocabulario · «Emisión» (sustantivo) bloquea en navegación', () => assert.notEqual(casaBloqueoNavegacion('Emisión'), null))
test('vocabulario · «IBAN» bloquea en navegación', () => assert.notEqual(casaBloqueoNavegacion('IBAN'), null))
test('vocabulario · «Solicitar» bloquea en navegación', () => assert.notEqual(casaBloqueoNavegacion('Solicitar'), null))
test('vocabulario · «Cerrar sesión» bloquea en navegación', () => assert.notEqual(casaBloqueoNavegacion('Cerrar sesión'), null))
test('vocabulario · «Siguiente» no bloquea', () => assert.equal(casaBloqueoNavegacion('Siguiente'), null))
test('vocabulario · «Buscar» no bloquea', () => assert.equal(casaBloqueoNavegacion('Buscar'), null))
test('vivo puro · «Aceptar» (término solo del guard) bloquea en el worker', () => assert.notEqual(motivoNoNavegacionLibreVivo({ tag: 'a', texto: 'Ir', title: 'Aceptar' }, URL_P), null))
test('vivo puro · title «Compartir por WhatsApp» (vocabulario del worker, no del módulo) bloquea', () => assert.notEqual(motivoNoNavegacionLibreVivo({ tag: 'a', texto: 'Ir', title: 'Compartir por WhatsApp' }, URL_P), null))
test('vivo puro · id con «sms» (atributo interno del vocabulario) bloquea', () => assert.notEqual(motivoNoNavegacionLibreVivo({ tag: 'a', texto: 'Ir', id: 'btnSmsAviso' }, URL_P), null))
test('vivo puro · «Contratación» de un desplegable pasa', () => assert.equal(motivoNoNavegacionLibreVivo({ tag: 'a', role: 'menuitem', texto: 'Contratación', hrefLiteral: '#' }, URL_P), null))
test('topes · 3 por defecto, 6 en la simulación de Vivienda de Fidelidade', () => {
  assert.deepEqual([topeNavegacionLibre(E_PELAYO), topeNavegacionLibre(E_FIDE)], [3, 6])
})
test('el explorador pulsa lo de la navegación libre SOLO por pulsarNavegacionLibre (nunca por el pulsar genérico)', () => {
  const src = readFileSync(new URL('../src/explorador.ts', import.meta.url), 'utf8')
  assert.match(src, /else if \(requiereNavegacionLibre\(k\.entrada, hit\.el, hit\.marco\)\) \{[\s\S]{0,400}?await pulsarNavegacionLibre\(loc, k\.guard, \{ entrada: k\.entrada, el: hit\.el, marco: hit\.marco \}\)\s*\} else \{\s*await k\.pulsar\(loc\)/)
})

// ───────────────────────── vivo: la puerta del guard ─────────────────────────

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
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
after(async () => { await browser.close() })

async function portal(url: string, cuerpo: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  const origen = new URL(url).origin
  await context.route(`${origen}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body>${cuerpo}<p id="out"></p></body></html>` }))
  await page.goto(url)
  return { context, page, guard }
}
const marca = "document.getElementById('out').textContent=(+document.getElementById('out').textContent||0)+1; return false"
const pulsadas = async (p: Page) => Number((await p.locator('#out').textContent()) || 0)
async function intentar(url: string, cuerpo: string, el: Record<string, unknown>, entrada = E_PELAYO, veces = 1) {
  const { context, page, guard } = await portal(url, cuerpo)
  const i = inv(url, el)
  let error: unknown = null
  try {
    for (let n = 0; n < veces; n++) await pulsarNavegacionLibre(page.locator('#x'), guard, { entrada, el: i.marcos[0].elementos[0], marco: i.marcos[0] })
  } catch (e) {
    error = e
  }
  const n = await pulsadas(page)
  await context.close()
  return { error, n }
}

test('vivo pasa · tarjeta «AUTOS» `a.card` sin href se pulsa', async () => {
  const r = await intentar(URL_P, `<a class="card" id="x" onclick="${marca}">AUTOS</a>`, CARD)
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('vivo pasa · menú «Contratación» role=menuitem desplegable (href="#", sin onclick) se pulsa', async () => {
  const r = await intentar(URL_P, '<a role="menuitem" aria-haspopup="true" href="#" id="x">Contratación</a>', MENU)
  assert.equal(r.error, null)
})
test('vivo pasa · «Buscar» en Fidelidade Domicilio.aspx', async () => {
  const r = await intentar(URL_DOMICILIO, `<a id="x" href="#" onclick="${marca}">Buscar</a>`, { tag: 'a', texto: 'Buscar', onclick: marca })
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('vivo pasa · «Siguiente» (enlace)', async () => {
  const r = await intentar(URL_P, `<a id="x" href="#" onclick="${marca}">Siguiente</a>`, { tag: 'a', texto: 'Siguiente', onclick: marca })
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('vivo pasa · pestaña role=tab', async () => {
  const r = await intentar(URL_P, `<span role="tab" id="x" onclick="${marca}">Coberturas</span>`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('vivo · la 3.ª pulsación del mismo control pasa', async () => {
  const r = await intentar(URL_P, `<a class="card" id="x" onclick="${marca}">AUTOS</a>`, CARD, E_PELAYO, 3)
  assert.deepEqual([r.error, r.n], [null, 3])
})
test('vivo bloquea · 4.ª pulsación del mismo control', async () => {
  const r = await intentar(URL_P, `<a class="card" id="x" onclick="${marca}">AUTOS</a>`, CARD, E_PELAYO, 4)
  assert.deepEqual([r.error !== null, r.n], [true, 3])
})
test('vivo · Fidelidade Vivienda: la 6.ª pasa y la 7.ª se bloquea', async () => {
  const r = await intentar(URL_DOMICILIO, `<a id="x" href="#" onclick="${marca}">Buscar</a>`, { tag: 'a', texto: 'Buscar', onclick: marca }, E_FIDE, 7)
  assert.deepEqual([r.error !== null, r.n], [true, 6])
})

const bloqueaVivo = (nombre: string, cuerpo: string, el: Record<string, unknown>, url = URL_P) =>
  test(`vivo bloquea · ${nombre}`, async () => {
    const r = await intentar(url, cuerpo, el)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
bloqueaVivo('botón sin texto con aria-label «Emitir» (el inventario lo veía como tarjeta)', `<a class="card" id="x" aria-label="Emitir" onclick="${marca}"></a>`, { tag: 'a', clase: 'card', ariaLabel: 'Emitir' })
bloqueaVivo('title «Firmar» que el inventario no ve', `<a class="card" id="x" title="Firmar" onclick="${marca}">AUTOS</a>`, CARD)
bloqueaVivo('clase btn-pagar que el inventario recortó', `<a class="card x y btn-pagar" id="x" onclick="${marca}">AUTOS</a>`, CARD)
bloqueaVivo('el control vivo no es el del inventario (texto distinto)', `<a class="card" id="x" onclick="${marca}">HOGAR</a>`, CARD)
bloqueaVivo('mattooltip «Emitir» (solo lo ve comprobarBoton)', `<a class="card" id="x" mattooltip="Emitir" onclick="${marca}">AUTOS</a>`, CARD)
bloqueaVivo('submit a /contratacion', `<form action="/contratacion/paso" onsubmit="${marca}"><button id="x">Siguiente</button></form>`, { tag: 'button', texto: 'Siguiente' })
bloqueaVivo('submit a /pago', `<form action="/pago" onsubmit="${marca}"><button id="x">Siguiente</button></form>`, { tag: 'button', texto: 'Siguiente' })
bloqueaVivo('enlace a logout', `<a id="x" href="/logout" onclick="${marca}">Ir</a>`, { tag: 'a', texto: 'Ir' })
bloqueaVivo('enlace a otro origen', `<a id="x" href="https://otro.example.com/" onclick="${marca}">Ir</a>`, { tag: 'a', texto: 'Ir' })
bloqueaVivo('«Contratación» con onclick vivo', `<a role="menuitem" id="x" onclick="${marca}">Contratación</a>`, MENU)
bloqueaVivo('ancestro con manejador de emisión', `<div onclick="enviarSms()"><a class="card" id="x" onclick="${marca}">AUTOS</a></div>`, CARD)

test('vivo bloquea · campo IBAN visible = frontera de emisión (no se pulsa)', async () => {
  const r = await intentar(URL_P, `<label>IBAN <input name="iban"></label><a class="card" id="x" onclick="${marca}">AUTOS</a>`, CARD)
  assert.deepEqual([r.error instanceof ErrorFronteraEmision, r.n], [true, 0])
})
