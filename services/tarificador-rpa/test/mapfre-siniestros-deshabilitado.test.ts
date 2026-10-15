// Mapfre NSEI · v0.8.4 (trabajo real 39c8016e, 15/10/2026). Ya en «Figuras», el bot murió `error_definitivo` con
// «locator.fill: Timeout 30000ms… app-historial-siniestralidad input[formcontrolname="siniestros"]»: el input estaba
// DESHABILITADO y el bot intentaba escribir «0». La grabación saneada del 15/10 NO toca ese campo (compañía anterior → nº de
// póliza → clic en el bloque → «Continuar»): con 0 siniestros es su estado natural. Y la red de la capa común: un TimeoutError
// de Playwright sobre un control mapeado abre atasco «hueco_mapa» en vez de morir mudo.
// Fixtures SINTÉTICAS (estructura de `app-historial-siniestralidad`); todos los valores inventados. Sin PII.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { ErrorMapaIncompleto, planObjetoYFiguras, rellenarCamposTexto, SEL_HISTORIAL, type PlanNsei } from '../src/adapters/mapfre/auto.ts'
import { atascoDeRespaldoHueco, CLAVE_ATASCO_HUECO_MAPA, type ContextoFormador } from '../src/formador.ts'
import { clasificarIntento, ErrorTarificador, timeoutDeControl } from '../src/errores.ts'

const form: FormularioAuto = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null },
  tomadorEsConductor: true,
  tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3,
  siniestrosUltimos5Anios: 0,
  garajeNoche: null,
  tomador: null,
  eleccionVersion: null,
  seleccionVehiculo: null,
  documentoTomador: '00000000T',
  usoVehiculo: 'particular',
  ambitoCirculacion: 'espana',
  clasePermiso: 'b',
  companiaAnterior: 'ASEGURADORA FICTICIA GENERALES',
} as FormularioAuto

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

/** `app-historial-siniestralidad` como en la prueba real: el input de siniestros (min 1, max 13), habilitado o no. */
const HISTORIAL = (habilitado: boolean) => `<body><app-historial-siniestralidad><div><div>
<mat-form-field><label><mat-label>Nº de Póliza</mat-label></label><input matinput formcontrolname="numPoliza" value=""></mat-form-field>
<mat-form-field><label><mat-label>Años compañía anterior</mat-label></label><input matinput formcontrolname="tiempoAntComp" disabled></mat-form-field>
<mat-form-field><label><mat-label>Siniestros RC 5 últimos años</mat-label></label><input matinput type="number" min="1" max="13" formcontrolname="siniestros" ${habilitado ? '' : 'disabled'}></mat-form-field>
</div><div></div></div></app-historial-siniestralidad></body>`

async function preparar(html: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return { context, page }
}

const formador = (): ContextoFormador => ({
  trabajoId: 't-prueba', compania: 'mapfre', ramo: 'auto', apiUrl: 'http://127.0.0.1:9', secreto: 'x', activo: true, acompanado: false,
  conocimiento: [], resueltos: new Map(), redactar: (t) => t, log: () => undefined,
})

/** Solo la operación de siniestros del plan real (`planObjetoYFiguras`). */
const planSiniestros = (n: number): PlanNsei => ({ escribibles: planObjetoYFiguras({ ...form, siniestrosUltimos5Anios: n }).escribibles.filter((o) => o.sel === SEL_HISTORIAL.siniestrosRc5), pendientes: [] })

test('A · 0 siniestros con el input DESHABILITADO (estado natural, la grabación no lo toca) → no se escribe y se sigue', async () => {
  const { context, page } = await preparar(HISTORIAL(false))
  const f = formador()
  const t0 = Date.now()
  await rellenarCamposTexto(page, planSiniestros(0), { page, formador: f }, 200)
  assert.ok(Date.now() - t0 < 1_500, 'esperó al timeout de Playwright en vez de comprobar si el campo es editable')
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '')
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).isDisabled(), true)
  assert.equal(f.atasco ?? null, null)
  await context.close()
})

test('A · >0 siniestros con el input DESHABILITADO (sin forma grabada de habilitarlo) → ATASCO + hueco, sin `fill` y sin el valor', async () => {
  const { context, page } = await preparar(HISTORIAL(false))
  const f = formador()
  const t0 = Date.now()
  await assert.rejects(
    () => rellenarCamposTexto(page, planSiniestros(2), { page, formador: f }, 200),
    (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom === true && /siniestros RC 5 años/.test(e.message) && /deshabilitado/.test(e.message),
  )
  assert.ok(Date.now() - t0 < 1_500, 'esperó al timeout de Playwright')
  assert.ok(f.atasco, 'sin checkpoint de atasco: el trabajo moriría error_definitivo')
  assert.match(f.atasco!.descripcion, /DESHABILITADO/)
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '')
  await context.close()
})

test('A · >0 siniestros con el input habilitado → se escribe como siempre', async () => {
  const { context, page } = await preparar(HISTORIAL(true))
  await rellenarCamposTexto(page, planSiniestros(2), { page, formador: formador() }, 200)
  assert.equal(await page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue(), '2')
  await context.close()
})

test('A · el plan marca «intacto si deshabilitado» SOLO con 0 siniestros', () => {
  assert.equal(planSiniestros(0).escribibles[0]!.intactoSiDeshabilitado, true)
  assert.equal(planSiniestros(1).escribibles[0]!.intactoSiDeshabilitado, undefined)
})

/** Un TimeoutError REAL de Playwright: `fill` sobre un input deshabilitado con un valor que no puede salir a ningún sitio. */
async function timeoutReal(page: Page): Promise<Error> {
  return page.locator(SEL_HISTORIAL.siniestrosRc5).fill('VALOR-FICTICIO-77', { timeout: 300 }).then(
    () => { throw new Error('el fill no debía funcionar') },
    (e: Error) => e,
  )
}

test('B · timeoutDeControl: acción + selector del TimeoutError de Playwright, nunca el valor; navegación y errores del adaptador no cuentan', async () => {
  const { context, page } = await preparar(HISTORIAL(false))
  const e = await timeoutReal(page)
  const t = timeoutDeControl(e)
  assert.ok(t, `no reconoce el timeout de Playwright: ${e.message.split('\n')[0]}`)
  assert.equal(t!.accion, 'fill')
  assert.match(t!.selector ?? '', /siniestros/)
  assert.ok(!JSON.stringify(t).includes('VALOR-FICTICIO-77'))
  assert.equal(timeoutDeControl(new Error('page.goto: Timeout 30000ms exceeded.')), null)
  assert.equal(timeoutDeControl(new ErrorTarificador('portal', 'locator.fill: Timeout 30000ms exceeded.')), null)
  // Sigue siendo `portal` NO transitorio (no se reintenta: otro login): el runner pasa por la red de atasco.
  const c = clasificarIntento(e, { logueado: true, loginVisible: false, ultimo5xx: null })
  assert.deepEqual([c.tipo, c.transitorio], ['portal', null])
  await context.close()
})

test('B · red de la capa común: un TimeoutError de Playwright sobre un control mapeado → atasco «hueco_mapa» (no error_definitivo mudo), sin el valor', async () => {
  const { context, page } = await preparar(HISTORIAL(false))
  const e = await timeoutReal(page)
  const f = formador()
  await atascoDeRespaldoHueco(page, f, e)
  assert.equal(f.atasco?.clave, CLAVE_ATASCO_HUECO_MAPA)
  assert.ok((f.atasco?.candidatos.length ?? 0) > 0)
  assert.match(f.atasco!.descripcion, /fill/)
  assert.match(f.atasco!.descripcion, /siniestros/)
  assert.ok(!JSON.stringify(f.atasco).includes('VALOR-FICTICIO-77'))
  // Con el formador apagado o con un checkpoint propio del adaptador, no cambia nada.
  const apagado = { ...formador(), activo: false }
  await atascoDeRespaldoHueco(page, apagado, e)
  assert.equal(apagado.atasco ?? null, null)
  await context.close()
})
