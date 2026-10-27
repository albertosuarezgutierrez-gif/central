// Mapfre NSEI · paso 2 · CÓMO SE LANZA la búsqueda por matrícula (bot 0.7.3, 15/10/2026). Regresión del trabajo de prueba que
// paró con «mapa incompleto: faltan cómo se lanza la búsqueda por matrícula» y acabó `error_definitivo` SIN atasco.
// Fixture SINTÉTICA: la ESTRUCTURA de `app-datos-vehiculo` es la del HTML de esa evidencia (input `name/formcontrolname=matricula`
// dentro de `mat-form-field`, botón `matsuffix` `.infoButton` con `info_outlined` al lado, «Buscador de vehículos» `txtPredictivo`
// con su lupa `search`, botón «Vehiculo NO catalogado», ningún `type=submit`); TODOS los valores son inventados.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { confirmarVehiculoMapfre, instalarGuardEmision, type GuardEmision } from '../src/guard.ts'
import { consultarVehiculoPorMatricula, ErrorMapaIncompleto, lanzarBusquedaMatricula, mapfreAuto, SEL_OBJETO } from '../src/adapters/mapfre/auto.ts'
import { atascoDeRespaldoHueco, CLAVE_ATASCO_HUECO_MAPA, type ContextoFormador } from '../src/formador.ts'
import { ErrorTarificador } from '../src/errores.ts'

const MATRICULA = '0000BBB'

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

const DIALOGO = `<app-matricula-dialog><table><thead><tr><th></th><th>Matrícula</th><th>Nº Bastidor</th><th>Denominación comercial</th><th>CV/KW</th><th>CC</th><th>Nº Puertas</th><th>Fecha Inicio</th></tr></thead><tbody>
<tr><td><input type="radio" name="veh" value="${MATRICULA}-B0" onchange="document.getElementById('ok').disabled=false"></td><td>${MATRICULA}</td><td>BASTIDOR-FICTICIO-0</td><td> MARCA PRUEBA MODELO X 1.6 </td><td>110</td><td>1598</td><td>5</td><td>01/03/2019</td></tr>
</tbody></table><div class="acciones"><button onclick="window.__noEs=1">No es el vehículo.</button>
<button id="ok" disabled onclick="window.__aceptado=1;document.querySelector('app-matricula-dialog').remove()">Aceptar</button></div></app-matricula-dialog>`

type Disparo = 'blur' | 'enter' | 'nunca'

/** `app-datos-vehiculo` con la estructura real; el diálogo se pinta SOLO con el disparo indicado. `enForm` = dentro de un `<form>`. */
const PASO2 = (disparo: Disparo, enForm = false) => {
  const seccion = `<app-datos-vehiculo><section class="ng-untouched ng-invalid"><h6>Datos del Vehículo</h6><div>
<mat-form-field class="mat-form-field"><div class="mat-form-field-infix"><input matinput autocomplete="off" type="text" name="matricula" formcontrolname="matricula" id="mat-input-55"><span class="mat-form-field-label-wrapper"><label for="mat-input-55"><mat-label>Matrícula</mat-label></label></span></div></mat-form-field>
<button matsuffix mat-icon-button type="button" class="infoButton mat-icon-button" onclick="window.__info=1"><span class="mat-button-wrapper"><mat-icon role="img" aria-hidden="true">info_outlined</mat-icon></span></button>
<mat-form-field class="mat-form-field"><div class="mat-form-field-infix"><input matinput type="text" name="bastidor" formcontrolname="bastidor" id="mat-input-56"><label for="mat-input-56"><mat-label>Nº Bastidor</mat-label></label></div></mat-form-field>
<mat-form-field class="mat-form-field"><div class="mat-form-field-infix"><input matinput type="text" name="cpCirculacion" formcontrolname="codPostal" id="mat-input-58"><label for="mat-input-58"><mat-label>CP. De Circulación</mat-label></label></div></mat-form-field>
</div><div class="row"><mat-form-field class="mat-form-field search"><div class="mat-form-field-infix"><input type="text" matinput formcontrolname="txtPredictivo" id="mat-input-59" role="combobox"><label for="mat-input-59"><mat-label>Buscador de vehículos</mat-label></label></div>
<div class="mat-form-field-suffix"><button matsuffix mat-icon-button type="button" class="mat-icon-button" onclick="window.__lupa=1"><span class="mat-button-wrapper"><mat-icon role="img" aria-hidden="true">search</mat-icon></span></button></div></mat-form-field>
<button mat-stroked-button type="button" class="btnVehiculoNC" onclick="window.__noCatalogado=1"> Vehiculo NO catalogado </button></div></section></app-datos-vehiculo>`
  const evento = disparo === 'blur' ? `m.addEventListener('blur', pinta)` : disparo === 'enter' ? `m.addEventListener('keyup', (e) => { if (e.key === 'Enter') pinta() })` : ''
  return `${enForm ? `<form onsubmit="window.__submit=1; return false">${seccion}</form>` : seccion}
<template id="t">${DIALOGO}</template>
<script>const m = document.querySelector('input[name=matricula]');
const pinta = () => { if (!document.querySelector('app-matricula-dialog')) document.body.append(document.getElementById('t').content.cloneNode(true)) };
${evento}</script>`
}

async function preparar(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(`<body>${html}</body>`)
  return { context, page, guard }
}

const marcas = (page: Page) => page.evaluate(() => {
  const w = window as unknown as Record<string, unknown>
  return { info: w.__info ?? null, lupa: w.__lupa ?? null, noCatalogado: w.__noCatalogado ?? null, submit: w.__submit ?? null, aceptado: w.__aceptado ?? null }
})

const formador = (): ContextoFormador => ({
  trabajoId: 't-prueba', compania: 'mapfre', ramo: 'auto', apiUrl: 'http://127.0.0.1:9', secreto: 'x', activo: true, acompanado: false,
  conocimiento: [], resueltos: new Map(), redactar: (t) => t, log: () => undefined,
})

test('Mapfre auto/moto 0.8.7 (0.8.7: moto por el plan del coche; 0.8.6: varias filas de vehículo → la primera como supuesto declarado; antes 0.8.5: siniestros deshabilitado)', () => {
  assert.equal(mapfreAuto.version, '0.8.27')
})

test('búsqueda por matrícula: se lanza AL SALIR DEL CAMPO (blur) y no se pulsa ningún botón (ni info, ni lupa del buscador, ni NO catalogado)', async () => {
  const { context, page, guard } = await preparar(PASO2('blur'))
  const v = await consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: (p, m) => confirmarVehiculoMapfre(p, guard, m) }, 2_000)
  assert.equal(v.denominacion, 'MARCA PRUEBA MODELO X 1.6')
  const m = await marcas(page)
  assert.deepEqual({ info: m.info, lupa: m.lupa, noCatalogado: m.noCatalogado, submit: m.submit }, { info: null, lupa: null, noCatalogado: null, submit: null })
  assert.equal(m.aceptado, 1, 'el vehículo se confirma por la función guardada')
  await context.close()
})

test('lanzarBusquedaMatricula: el disparo es salir del campo; un diálogo ya abierto al teclear no hace salir', async () => {
  const a = await preparar(PASO2('blur'))
  const campo = a.page.locator(SEL_OBJETO.matricula)
  await campo.fill(MATRICULA)
  assert.equal(await lanzarBusquedaMatricula(a.page, campo, 1_000), 'salir_del_campo')
  await a.context.close()
  const b = await preparar(`${PASO2('nunca')}${DIALOGO}`)
  assert.equal(await lanzarBusquedaMatricula(b.page, b.page.locator(SEL_OBJETO.matricula), 1_000), 'al_teclear')
  await b.context.close()
})

test('búsqueda por matrícula: un portal que solo busca con Intro NO se fuerza (ni tecla ni lupa) → hueco con ATASCO de la capa común, sin matrícula en el error', async () => {
  const { context, page } = await preparar(PASO2('enter', true))
  const f = formador()
  await assert.rejects(
    () => consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: async () => { throw new Error('no debe llegar aquí') } }, 300, { page, formador: f }),
    (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom === true && /cómo se lanza la búsqueda por matrícula/.test(e.message) && !/0000|BBB/.test(e.message),
  )
  const m = await marcas(page)
  assert.deepEqual({ submit: m.submit, lupa: m.lupa, info: m.info }, { submit: null, lupa: null, info: null }, 'el adaptador tecleó Intro o pulsó un botón')
  assert.equal(await page.locator('app-matricula-dialog').count(), 0)
  // El checkpoint del ATASCO queda en el formador: el runner lo manda y asegura deja el trabajo `atascado` (Telegram).
  assert.ok(f.atasco, 'sin checkpoint de atasco: el trabajo moriría error_definitivo mudo')
  assert.equal(f.atasco!.clave, 'matricula_busqueda_vehiculo')
  assert.ok(f.atasco!.candidatos.length > 0)
  assert.ok(!JSON.stringify(f.atasco).includes(MATRICULA))
  await context.close()
})

test('búsqueda por matrícula: ningún disparo abre el diálogo → hueco (portal, con inventario)', async () => {
  const { context, page } = await preparar(PASO2('nunca'))
  await assert.rejects(
    () => consultarVehiculoPorMatricula(page, MATRICULA, { confirmarVehiculoMapfre: async () => {} }, 300),
    (e) => e instanceof ErrorMapaIncompleto && e.tipo === 'portal' && e.pideInventarioDom === true,
  )
  await context.close()
})

// ── RED de la capa común: un hueco de mapa SIN checkpoint propio deja el suyo (runner) ──

test('atascoDeRespaldoHueco: hueco de mapa sin checkpoint → atasco «hueco_mapa» con candidatos de la pantalla', async () => {
  const { context, page } = await preparar(PASO2('nunca'))
  const f = formador()
  await atascoDeRespaldoHueco(page, f, new ErrorMapaIncompleto('una pantalla nueva', true))
  assert.equal(f.atasco?.clave, CLAVE_ATASCO_HUECO_MAPA)
  assert.ok((f.atasco?.candidatos.length ?? 0) > 0)
  await context.close()
})

test('atascoDeRespaldoHueco: respeta el checkpoint del adaptador; no actúa sin hueco de mapa ni con el formador apagado', async () => {
  const { context, page } = await preparar(PASO2('nunca'))
  const propio = formador()
  propio.atasco = { clave: 'propio', tipo: 'campo', descripcion: 'x', etiqueta: null, textoEsperado: null, candidatos: [{ n: 1, tag: 'input', id: 'a', name: null, type: 'text', role: null, texto: null, etiqueta: null, marco: null, selector: '#a' }] }
  await atascoDeRespaldoHueco(page, propio, new ErrorMapaIncompleto('x', true))
  assert.equal(propio.atasco?.clave, 'propio')
  const otro = formador()
  await atascoDeRespaldoHueco(page, otro, new ErrorTarificador('portal', 'mapfre/auto: prima ilegible'))
  await atascoDeRespaldoHueco(page, otro, new ErrorMapaIncompleto('sin inventario', false))
  assert.equal(otro.atasco ?? null, null)
  const apagado = { ...formador(), activo: false }
  await atascoDeRespaldoHueco(page, apagado, new ErrorMapaIncompleto('x', true))
  assert.equal(apagado.atasco ?? null, null)
  await context.close()
})

test('runner: la red de atasco va ANTES de leer el checkpoint que se manda a asegura, solo en fallos de portal no transitorios', () => {
  const src = readFileSync(join(import.meta.dirname, '../src/runner.ts'), 'utf8')
  const i = src.indexOf("if (c.tipo === 'portal' && !c.transitorio) await atascoDeRespaldoHueco(actual, k.formador, error)")
  const j = src.indexOf('const atasco = c.tipo')
  assert.ok(i > 0 && j > i, 'el runner no llama a atascoDeRespaldoHueco antes de tomar k.formador.atasco')
})
