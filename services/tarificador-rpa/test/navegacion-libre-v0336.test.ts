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
import { comprobarBoton, motivoRotuloPulsar, rotuloNombraAccionFinal, tieneLetraAjena, unirDeletreo } from '@central/module-tarificacion'
import { ErrorFronteraEmision, instalarGuardEmision, MAX_PULSACIONES_NAVEGACION_TOTAL, motivoNoNavegacionLibreVivo, oyentesAccionVivos, pulsar, pulsarNavegacionLibre, topeNavegacionLibre, type GuardEmision } from '../src/guard.ts'
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
// Manejador por addEventListener (invisible para la regla). 2.ª revisión adversarial: una pestaña CON oyente y rótulo no neutro ya NO pasa
// (cepo abajo, «(R3)»); sin oyentes, sí (se ve por el foco: el clic la enfoca).
const oyente = (sel: string) => `<script>document.querySelectorAll('${sel}').forEach(function (e) { e.addEventListener('click', function () { var o = document.getElementById('out'); o.textContent = (+o.textContent || 0) + 1 }) })</script>`
test('vivo pasa · pestaña role=tab sin oyentes', async () => {
  const { context, page, guard } = await portal(URL_P, '<span role="tab" tabindex="0" id="x">Coberturas</span>')
  const i = inv(URL_P, { tag: 'span', role: 'tab', texto: 'Coberturas' })
  let error: unknown = null
  try {
    await pulsarNavegacionLibre(page.locator('#x'), guard, { entrada: E_PELAYO, el: i.marcos[0].elementos[0], marco: i.marcos[0] })
  } catch (e) {
    error = e
  }
  const foco = await page.evaluate(() => document.activeElement?.id ?? null)
  await context.close()
  assert.deepEqual([error, foco], [null, 'x'])
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

// ───────────────── revisión adversarial (03/11/2026): lista BLANCA por tipo, normalización fuerte, tope global ─────────────────

// (1) Lista negra fail-open: verbos de acción final como BOTÓN (lista blanca) y como ENLACE con href del mismo origen (lista negra reforzada).
const FINALES = ['Finalizar', 'Terminar', 'Completar', 'Comprar', 'Adquirir', 'Suscribir', 'Registrar', 'Activar', 'Aprobar', 'Validar', 'Realizar pedido', 'Abonar', 'Presentar', 'Cursar', 'Efectuar', 'Ok', 'Hecho', 'Submit', 'Buy', 'Finish', 'Complete', 'Sign', 'Apply', 'Place order']
for (const f of FINALES) {
  bloquea(`(1) botón «${f}»`, { tag: 'button', texto: f })
  bloquea(`(1) enlace mismo origen «${f}»`, { tag: 'a', texto: f, hrefRuta: '/portalmediador-paso-2/' })
  test(`(1) vocabulario del worker · «${f}» bloquea en navegación`, () => assert.notEqual(casaBloqueoNavegacion(f), null))
}
for (const f of ['Continuar', 'Siguiente', 'Calcular', 'Buscar', 'Anterior', 'Ver precio', 'Coberturas', 'Comprobar']) {
  test(`(1) vocabulario · «${f}» no bloquea`, () => assert.equal(casaBloqueoNavegacion(f), null))
}

// (2) Unicode: ancho completo, invisibles, guion blando, letras separadas, cirílico. Como ENLACE (lo que decide es el bloqueo).
const ENLACE = (texto: string) => ({ tag: 'a', texto, hrefRuta: '/portalmediador-paso-2/' })
bloquea('(2) «Ｅｍｉｔｉｒ» (ancho completo)', ENLACE('Ｅｍｉｔｉｒ'))
bloquea('(2) «Emi\\u200btir» (espacio de ancho cero)', ENLACE('Emi​tir'))
bloquea('(2) «Conf\\u00adirmar» (guion blando)', ENLACE('Conf­irmar'))
bloquea('(2) «e m i t i r» (letras separadas)', ENLACE('e m i t i r'))
bloquea('(2) «E-M-I-T-I-R»', ENLACE('E-M-I-T-I-R'))
bloquea('(2) «\\u0415mitir» (E cirílica)', ENLACE('Еmitir'))
bloquea('(2) «C\\u2060ontratar» (word joiner)', ENLACE('C⁠ontratar'))
test('(2) vivo puro · «Ｃｏｎｆｉｒｍａｒ» bloquea en el worker', () => assert.notEqual(motivoNoNavegacionLibreVivo({ tag: 'a', texto: 'Ｃｏｎｆｉｒｍａｒ', hrefLiteral: '/x/', hrefAbsoluto: `${PELAYO}/x/` }, URL_P), null))
test('(2) vivo puro · «f i n a l i z a r» bloquea en el worker', () => assert.notEqual(motivoNoNavegacionLibreVivo({ tag: 'a', texto: 'f i n a l i z a r', hrefLiteral: '/x/', hrefAbsoluto: `${PELAYO}/x/` }, URL_P), null))

// (3) Acción opaca: un manejador con un rótulo que no es EXACTAMENTE un neutro.
bloquea('(3) enlace «Ir al resumen» con onclick go(7)', { tag: 'a', texto: 'Ir al resumen', onclick: 'go(7)' })
bloquea('(3) botón «Resumen» con onclick go(7)', { tag: 'button', texto: 'Resumen', onclick: 'go(7)' })
bloquea('(3) enlace «Resumen» sin href (manejador invisible)', { tag: 'a', texto: 'Resumen' })
bloquea('(3) pestaña «Resumen» con onclick go(7)', { tag: 'li', role: 'tab', texto: 'Resumen', onclick: 'go(7)' })
bloquea('(3) tarjeta «Ver más» (no es un ramo)', { tag: 'a', clase: 'card', texto: 'Ver más' })

// (4) href javascript: (el absoluto se saltaba la comprobación) y esquemas que no navegan.
bloquea('(4) href javascript:go(7) «Resumen»', { tag: 'a', texto: 'Resumen', hrefLiteral: 'javascript:go(7)', hrefAbsoluto: 'javascript:go(7)' })
bloquea('(4) href javascript:emitir() «Siguiente»', { tag: 'a', texto: 'Siguiente', hrefLiteral: 'javascript:emitir()', hrefAbsoluto: 'javascript:emitir()' })
bloquea('(4) href data:', { tag: 'a', texto: 'Resumen', hrefLiteral: 'data:text/html,x' })
bloquea('(4) inventario: ruta de otro esquema (null…)', { tag: 'a', texto: 'Resumen', hrefRuta: 'nullx' })
bloquea('(4) enlace con target=_blank', { tag: 'a', texto: 'Presupuestos', hrefLiteral: '/p/', hrefAbsoluto: `${PELAYO}/p/`, target: '_blank' })
bloquea('(4) enlace con download', { tag: 'a', texto: 'Presupuestos', hrefLiteral: '/p/', hrefAbsoluto: `${PELAYO}/p/`, descarga: true })

// (5) Submit y role=button con rótulo no neutro.
bloquea('(5) input submit «Paso 2» a ruta neutra', { tag: 'input', type: 'submit', value: 'Paso 2', accionFormulario: `${PELAYO}/portalmediador-paso-2/` })
bloquea('(5) div role=button «Datos»', { tag: 'div', role: 'button', texto: 'Datos' })
bloquea('(5) span role=button «Coberturas»', { tag: 'span', role: 'button', texto: 'Coberturas' })
bloquea('(5) submit «Siguiente» con aria-label no neutro', { tag: 'button', texto: 'Siguiente', ariaLabel: 'Ir al paso 3', enviaFormulario: true, accionFormulario: `${PELAYO}/portalmediador-paso-2/` })

// Lo que tiene que seguir pasando.
test('pasa · tarjeta «HOGAR» `a.card` sin href', () => assert.equal(ok({ tag: 'a', clase: 'card', texto: 'HOGAR' }), true))
test('pasa · tarjeta «AUTOS» `a.card` con onclick (ramo de la lista cerrada)', () => assert.equal(ok({ tag: 'a', clase: 'card', texto: 'AUTOS', onclick: 'go(7)' }), true))
test('pasa · enlace del menú con href del mismo origen', () => assert.equal(ok({ tag: 'a', role: 'link', texto: 'Presupuestos', hrefRuta: '/portalmediador-presupuestos/' }), true))
test('pasa · enlace vivo con href absoluto del mismo origen', () => assert.equal(ok({ tag: 'a', texto: 'Presupuestos', hrefLiteral: '/portalmediador-presupuestos/', hrefAbsoluto: `${PELAYO}/portalmediador-presupuestos/` }), true))
test('pasa · menú «Contratación» dropdown-toggle vivo (href="#", aria-haspopup)', () => assert.equal(ok({ tag: 'a', clase: 'nav-link dropdown-toggle', texto: 'Contratación', hrefLiteral: '#', ariaHaspopup: 'true' }), true))
for (const t of ['Siguiente', 'Buscar', 'Calcular', 'Ver precio', 'Continuar ›']) {
  test(`pasa · botón «${t}»`, () => assert.equal(ok({ tag: 'button', texto: t }), true))
}
test('pasa · input submit «Siguiente» a ruta del mismo origen', () => assert.equal(ok({ tag: 'input', type: 'submit', value: 'Siguiente', enviaFormulario: true, accionFormulario: `${PELAYO}/portalmediador-paso-2/` }), true))
test('pasa · botón «Siguiente» con onclick sin término prohibido (riesgo residual aceptado: rótulo neutro exacto)', () => assert.equal(ok({ tag: 'button', texto: 'Siguiente', onclick: 'go(7)' }), true))

bloqueaVivo('(4) enlace «Resumen» del inventario con href y vivo javascript:go(7)', `<a id="x" href="javascript:go(7)">Resumen</a>`, { tag: 'a', texto: 'Resumen', hrefRuta: '/portalmediador-paso-2/' })
bloqueaVivo('(4) enlace con target=_blank vivo', `<a id="x" href="/portalmediador-paso-2/" target="_blank" onclick="${marca}">Presupuestos</a>`, { tag: 'a', texto: 'Presupuestos', hrefRuta: '/portalmediador-paso-2/' })
bloqueaVivo('(5) div role=button «Datos» vivo', `<div role="button" id="x" onclick="${marca}">Datos</div>`, { tag: 'div', role: 'button', texto: 'Datos' })

// (6) Tope GLOBAL por trabajo: 14 controles distintos × 3 pulsaciones = 42 intentos → la 41.ª se bloquea.
test('(6) vivo · tope global: la pulsación 41 (de cualquier control) se bloquea', async () => {
  const ids = Array.from({ length: 14 }, (_, i) => `s${i}`)
  const { context, page, guard } = await portal(URL_P, `${ids.map((id) => `<button type="button" id="${id}" class="b">Siguiente</button>`).join('')}${oyente('.b')}`)
  let hechas = 0
  let error: unknown = null
  try {
    for (const id of ids) {
      const i = inv(URL_P, { tag: 'button', type: 'button', texto: 'Siguiente', id })
      for (let n = 0; n < 3; n++) {
        await pulsarNavegacionLibre(page.locator(`#${id}`), guard, { entrada: E_PELAYO, el: i.marcos[0].elementos[0], marco: i.marcos[0] })
        hechas++
      }
    }
  } catch (e) {
    error = e
  }
  const n = await pulsadas(page)
  await context.close()
  assert.deepEqual([MAX_PULSACIONES_NAVEGACION_TOTAL, hechas, n, error !== null], [40, 40, 40, true])
})

// ───────────────── `pulsar()` genérico: bloquea por sí solo un rótulo de acción final (sin el validador) ─────────────────

test('puro · rotuloNombraAccionFinal: «Confirmar», «Ｃｏｎｆｉｒｍａｒ», «c o n f i r m a r», «Submit» sí; «Siguiente», «Comprobar», «Calcular» no', () => {
  assert.deepEqual(
    ['Confirmar', 'Ｃｏｎｆｉｒｍａｒ', 'c o n f i r m a r', 'Conf­irmar', 'Submit', 'Finalizar', 'Place order', 'Siguiente', 'Comprobar', 'Calcular', 'Continuar'].map((x) => rotuloNombraAccionFinal(x)),
    [true, true, true, true, true, true, true, false, false, false, false],
  )
})
async function pulsarGenerico(cuerpo: string): Promise<{ error: unknown; n: number }> {
  const { context, page, guard } = await portal(URL_P, `${cuerpo}${oyente('#x')}`)
  let error: unknown = null
  try {
    await pulsar(page.locator('#x'), guard)
  } catch (e) {
    error = e
  }
  const n = await pulsadas(page)
  await context.close()
  return { error, n }
}
for (const [nombre, html] of [
  ['«Confirmar» genérico (no Generali)', '<button type="button" id="x">Confirmar</button>'],
  ['«Ｃｏｎｆｉｒｍａｒ» ancho completo', '<button type="button" id="x">Ｃｏｎｆｉｒｍａｒ</button>'],
  ['«Finalizar»', '<button type="button" id="x">Finalizar</button>'],
  ['input value «Submit»', '<input type="button" id="x" value="Submit">'],
  ['aria-label «Comprar»', '<button type="button" id="x" aria-label="Comprar">›</button>'],
] as const) {
  test(`pulsar() bloquea · ${nombre}`, async () => {
    const r = await pulsarGenerico(html)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
}
for (const t of ['Siguiente', 'Calcular', 'Comprobar']) {
  test(`pulsar() pasa · «${t}»`, async () => {
    const r = await pulsarGenerico(`<button type="button" id="x">${t}</button>`)
    assert.deepEqual([r.error, r.n], [null, 1])
  })
}
bloqueaVivo('(3) enlace href="#" «Resumen» con manejador invisible (el inventario lo ve como enlace; vivo, no)', `<a id="x" href="#">Resumen</a>${oyente('#x')}`, { tag: 'a', texto: 'Resumen', hrefRuta: '/portalmediador-nuevo-presupuesto/' })

// ───────────────── 2.ª revisión adversarial (03/11/2026, Chromium real + servidor que escucha POST): R1-R6 ─────────────────
// Cada brazo se vio en ROJO rompiendo lo que protege y en verde restaurado. Fixtures sintéticas, sin PII.

// (R1) UNA normalización fuerte (`normalizarFuerte` + `unirDeletreo`) en comprobarBoton, pulsar() y la navegación libre.
const UNICODE_R1: readonly [string, string][] = [
  ['«Ｅｍｉｔｉｒ» (ancho completo)', 'Ｅｍｉｔｉｒ'],
  ['«Emi\\u200btir» (ancho cero)', 'Emi​tir'],
  ['«\\u0415mitir» (E cirílica)', 'Еmitir'],
  ['«Ｐａｇａｒ»', 'Ｐａｇａｒ'],
  ['«Ｃｏｎｔｒａｔａｒ»', 'Ｃｏｎｔｒａｔａｒ'],
  ['«Ｆｉｒｍａｒ»', 'Ｆｉｒｍａｒ'],
  ['«C o n t r a t a r» (letras sueltas)', 'C o n t r a t a r'],
]
for (const [nombre, t] of UNICODE_R1) {
  test(`(R1) comprobarBoton bloquea · ${nombre}`, () => assert.throws(() => comprobarBoton([t])))
  test(`(R1) pulsar() bloquea · ${nombre}`, async () => {
    const r = await pulsarGenerico(`<button type="button" id="x">${t}</button>`)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
  test(`(R1) navegación libre bloquea · ${nombre} como pestaña`, () => assert.equal(ok({ tag: 'li', role: 'tab', texto: t }), false))
}
test('(R1) pulsar() bloquea · «Emıtir» (ı sin punto: regla de homoglifos)', async () => {
  const r = await pulsarGenerico('<button type="button" id="x">Emıtir</button>')
  assert.deepEqual([r.error !== null, r.n], [true, 0])
})
test('(R1) unirDeletreo: une solo tiradas de ≥3 letras sueltas', () => {
  assert.deepEqual(['c o n t r a t a r', 'e.m.i.t.i.r', 'ir a generar proyecto', 'planta baja', 'a b'].map(unirDeletreo), ['contratar', 'emitir', 'ir a generar proyecto', 'planta baja', 'a b'])
})

// (R2) Nombre accesible: aria-labelledby, alt de <img> hijas, alt de input type=image.
for (const [nombre, html] of [
  ['aria-labelledby → «Emitir»', '<button type="button" id="x" aria-labelledby="l">›</button><span id="l">Emitir</span>'],
  ['<img alt="Emitir"> hija', '<button type="button" id="x"><img alt="Emitir" src="data:,"></button>'],
  ['input type=image alt «Emitir»', '<input type="image" id="x" alt="Emitir" src="data:,">'],
  ['input type=image alt «Contratar»', '<input type="image" id="x" alt="Contratar" src="data:,">'],
] as const) {
  test(`(R2) pulsar() bloquea · ${nombre}`, async () => {
    const r = await pulsarGenerico(html)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
}
// Enlaces del mismo origen SIN manejador (pasarían la lista blanca): solo el nombre accesible los delata.
bloqueaVivo('(R2) enlace «Presupuestos» con aria-labelledby → «Emitir»', '<a id="x" href="/portalmediador-paso-2/" aria-labelledby="l">Presupuestos</a><span id="l">Emitir</span>', { tag: 'a', texto: 'Presupuestos', hrefRuta: '/portalmediador-paso-2/' })
bloqueaVivo('(R2) enlace «Presupuestos» con <img alt="Contratar">', '<a id="x" href="/portalmediador-paso-2/">Presupuestos<img alt="Contratar" src="data:,"></a>', { tag: 'a', texto: 'Presupuestos', hrefRuta: '/portalmediador-paso-2/' })

// (R3) Oyentes por addEventListener (CDP): menú/pestaña/enlace con oyente y rótulo no neutro → no, aunque el rótulo no nombre nada.
const oyenteEn = (expr: string, tipo = 'click') => `<script>(${expr}).addEventListener('${tipo}', function () { var o = document.getElementById('out'); o.textContent = (+o.textContent || 0) + 1 })</script>`
bloqueaVivo('(R3) pestaña «Coberturas» con oyente click', `<span role="tab" id="x">Coberturas</span>${oyenteEn("document.getElementById('x')")}`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
bloqueaVivo('(R3) menú «Resumen» con oyente mousedown', `<a role="menuitem" href="#" id="x">Resumen</a>${oyenteEn("document.getElementById('x')", 'mousedown')}`, { tag: 'a', role: 'menuitem', texto: 'Resumen' })
bloqueaVivo('(R3) enlace mismo origen «Presupuestos» con oyente pointerdown', `<a id="x" href="/portalmediador-paso-2/">Presupuestos</a>${oyenteEn("document.getElementById('x')", 'pointerdown')}`, { tag: 'a', texto: 'Presupuestos', hrefRuta: '/portalmediador-paso-2/' })
bloqueaVivo('(R3) pestaña con oyente en un HIJO', `<span role="tab" id="x"><b id="h">Coberturas</b></span>${oyenteEn("document.getElementById('h')")}`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
bloqueaVivo('(R3) pestaña con oyente en un ANCESTRO', `<div id="p"><span role="tab" id="x">Coberturas</span></div>${oyenteEn("document.getElementById('p')")}`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
bloqueaVivo('(R3) pestaña con oyente delegado en document', `<span role="tab" id="x">Coberturas</span>${oyenteEn('document')}`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
bloqueaVivo('(R3) pestaña con oyente de la página en window', `<span role="tab" id="x">Coberturas</span>${oyenteEn('window', 'keydown')}`, { tag: 'span', role: 'tab', texto: 'Coberturas' })
const VERBOS_R3 = ['Delete', 'Transferir', 'Reservar', 'Autorizar', 'Liquidar', 'Ejecutar', 'Procesar', 'Renovar', 'Traspasar', 'Transfer', 'Book', 'Authorize', 'Settle', 'Execute', 'Process', 'Renew', 'Remove']
for (const v of VERBOS_R3) {
  bloquea(`(R3) menú «${v}» (lista negra)`, { tag: 'a', role: 'menuitem', texto: v })
  bloquea(`(R3) enlace mismo origen «${v}» (lista negra)`, { tag: 'a', texto: v, hrefRuta: '/portalmediador-paso-2/' })
  test(`(R3) vocabulario del worker · «${v}» bloquea en navegación`, () => assert.notEqual(casaBloqueoNavegacion(v), null))
}
test('(R3) vivo pasa · «Siguiente» (neutro exacto) aunque tenga oyente', async () => {
  const r = await intentar(URL_P, `<a id="x" href="#">Siguiente</a>${oyente('#x')}`, { tag: 'a', texto: 'Siguiente', hrefRuta: '/portalmediador-nuevo-presupuesto/' })
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('(R3) vivo pasa · tarjeta de ramo «AUTOS» aunque tenga oyente', async () => {
  const r = await intentar(URL_P, `<a class="card" id="x">AUTOS</a>${oyente('#x')}`, CARD)
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('(R3) vivo pasa · enlace mismo origen sin oyentes (los del propio Playwright en window no cuentan)', async () => {
  const { context, page, guard } = await portal(URL_P, '<a id="x" href="/portalmediador-presupuestos/">Presupuestos</a>')
  const i = inv(URL_P, { tag: 'a', texto: 'Presupuestos', hrefRuta: '/portalmediador-presupuestos/' })
  let error: unknown = null
  try {
    await pulsarNavegacionLibre(page.locator('#x'), guard, { entrada: E_PELAYO, el: i.marcos[0].elementos[0], marco: i.marcos[0] })
    await page.waitForURL('**/portalmediador-presupuestos/')
  } catch (e) {
    error = e
  }
  const url = page.url()
  await context.close()
  assert.deepEqual([error, url], [null, `${PELAYO}/portalmediador-presupuestos/`])
})
test('(R3) oyentesAccionVivos: «ninguno» sin oyentes, «hay» con uno en el control', async () => {
  const { context, page } = await portal(URL_P, `<a id="x" href="#">A</a><a id="y" href="#">B</a>${oyenteEn("document.getElementById('y')")}`)
  const r = [await oyentesAccionVivos(page.locator('#x')), await oyentesAccionVivos(page.locator('#y')), await oyentesAccionVivos(page.locator('#x'))]
  const marcaQuitada = await page.evaluate(() => document.querySelectorAll('[data-guard-oyentes]').length)
  await context.close()
  assert.deepEqual([...r, marcaQuitada], ['ninguno', 'hay', 'ninguno', 0])
})
test('(R3) CDP que falla (no Chromium) → «error» (quien llama bloquea)', async () => {
  const falso = {
    page: () => ({ context: () => ({ newCDPSession: async () => { throw new Error('CDP no disponible') } }), mainFrame: () => null }),
    elementHandle: async () => ({ ownerFrame: async () => null, evaluate: async () => undefined }),
    evaluate: async () => undefined,
  }
  assert.equal(await oyentesAccionVivos(falso as never), 'error')
})
test('(R3) contexto sin newCDPSession → «error»', async () => {
  const falso = { page: () => ({ context: () => ({}), mainFrame: () => null }), elementHandle: async () => ({ ownerFrame: async () => null, evaluate: async () => undefined }), evaluate: async () => undefined }
  assert.equal(await oyentesAccionVivos(falso as never), 'error')
})

// (R4) Homoglifos fuera de CONFUSABLES: fail-closed en navegación libre y en pulsar().
test('(R4) tieneLetraAjena: ı, ɑ, ᴇ, cirílico sí; ñ, tildes, ç, ª/º, flechas, € no', () => {
  assert.deepEqual(
    ['Emıtir', 'Contrɑtar', 'ᴇmitir', 'Рresupuestos', 'Añadir', 'Póliza', 'Açores', 'Nº 1ª', 'Siguiente ›', '10 €', '✓'].map(tieneLetraAjena),
    [true, true, true, true, false, false, false, false, false, false, false],
  )
})
for (const t of ['Emıtir', 'Contrɑtar', 'ᴇmitir', 'Prеsupuestos']) {
  bloquea(`(R4) enlace mismo origen «${t}»`, { tag: 'a', texto: t, hrefRuta: '/portalmediador-paso-2/' })
  test(`(R4) pulsar() bloquea · «${t}»`, async () => {
    const r = await pulsarGenerico(`<button type="button" id="x">${t}</button>`)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
}
test('(R4) pulsar() bloquea · «Sıguiente» (ı)', async () => {
  const r = await pulsarGenerico('<button type="button" id="x">Sıguiente</button>')
  assert.deepEqual([r.error !== null, r.n], [true, 0])
})

// (R5) RIESGO ACEPTADO (documentado, no cepo): un submit con rótulo NEUTRO exacto a una ruta neutra del mismo origen que lleva campos OCULTOS
// de acción (`<input type=hidden name=accion value=emitir>`) pasa la navegación libre; lo para el guard de RED (`parametrosParecenEmision` /
// `cuerpoLlevaAccionFinal` sobre el cuerpo del POST), no esta regla.

// (R6) pulsar() genérico: verbos que nunca pulsa (salvo las puertas estrechas por compañía, que no pasan por aquí).
for (const t of ['Enviar', 'Send', 'Solicitar', 'Eliminar', 'Borrar', 'Cobrar', 'Autorizar', 'Save', 'Guardar', 'Reenviar SMS', 'Delete', 'Transferir']) {
  test(`(R6) pulsar() bloquea · «${t}»`, async () => {
    const r = await pulsarGenerico(`<button type="button" id="x">${t}</button>`)
    assert.deepEqual([r.error !== null, r.n], [true, 0])
  })
}
test('(R6) pulsar() pasa · «Cancelar» (lo usa la puerta del diálogo «Atención» de ePAC por pulsar())', async () => {
  const r = await pulsarGenerico('<button type="button" id="x">Cancelar</button>')
  assert.deepEqual([r.error, r.n], [null, 1])
})
test('(R6) motivoRotuloPulsar: «Avenida de la Reserva» casa verbo (por eso el value de un campo de texto no se mira como rótulo)', () => {
  assert.equal(motivoRotuloPulsar('Avenida de la Reserva'), 'verbo_prohibido')
})
test('(R6) pulsar() pasa un campo de texto cuyo valor tecleado nombra un verbo (el value no es rótulo)', async () => {
  const r = await pulsarGenerico('<input type="text" id="x" value="Calle Reserva 3">')
  assert.deepEqual([r.error, r.n], [null, 1])
})
