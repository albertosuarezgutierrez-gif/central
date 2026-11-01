// Mapfre auto v0.8.33 (27/10/2026, ejecución real 68c03964 con 0.8.32): el «Compañia» de «Datos básicos» es la entidad emisora de Mapfre, NO la compañía
// anterior (hipótesis errónea de 0.8.32). Sin control de compañía anterior en la pantalla NO se atasca: aviso en la oferta. Con control visible se rellena.
// Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { AVISO_COMPANIA_ANTERIOR_NO_PEDIDA, companiaAnteriorSinControl, mapfreAuto, ofertasDesdePrimasMapfre, rellenarMatSelects } from '../src/adapters/mapfre/auto.ts'

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
async function pagina(html: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return page
}
const SEL = '<mat-select formcontrolname="compania" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>'
const COMPANIA = `<mat-form-field><label><mat-label>Compañia</mat-label></label>${SEL}</mat-form-field>`
// Datos básicos: la entidad emisora de Mapfre (única opción real «MAPFRE ESPAÑA…»), visible o tapada por el stepper.
const DATOS_BASICOS = (visible: boolean) => `<mat-stepper><div class="mat-horizontal-stepper-content" style="visibility:${visible ? 'visible' : 'hidden'}"><app-datos-basicos>${COMPANIA}</app-datos-basicos></div></mat-stepper>`
const OP_COMPANIA = { sel: 'app-historial-siniestralidad mat-select[formcontrolname="companiaAnterior"]', etiqueta: 'compañía anterior', tipo: 'mat-select' as const, valor: 'ZZ Seguros', paso: 'figuras' as const, opciones: ['ZZ Seguros'] }

test('v0.8.33 · la versión del bot es 0.8.33', () => assert.equal(mapfreAuto.version, '0.8.40'))

test('«Compañia» de Datos básicos oculto por el stepper (única opción Mapfre): NO hay control de compañía anterior, no se usa', async () => {
  const page = await pagina(DATOS_BASICOS(false))
  const pulsados: unknown[] = []
  assert.equal(await companiaAnteriorSinControl(page, async (b) => void pulsados.push(b), 0), true)
  assert.deepEqual(pulsados, [])
})

test('pantalla sin ningún control de compañía anterior: sin control (no atasca)', async () => {
  const page = await pagina('<body><app-coberturas><input disabled value="x"></app-coberturas></body>')
  assert.equal(await companiaAnteriorSinControl(page, undefined, 0), true)
})

test('control visible y habilitado por etiqueta: HAY control, se rellena como siempre (casado exacto) y nunca difuso', async () => {
  const page = await pagina(`<body>${COMPANIA}</body>`)
  assert.equal(await companiaAnteriorSinControl(page, undefined, 0), false)
  const elegidas: string[][] = []
  const ctx = { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o); return { texto: o[0], origen: 'coincidencia' as const } } } as never
  assert.deepEqual(await rellenarMatSelects(page, { escribibles: [OP_COMPANIA], pendientes: [] }, ctx, undefined, 0), ['compañía anterior'])
  assert.deepEqual(elegidas, [['ZZ Seguros']])
})

test('con el selector del historial presente: HAY control', async () => {
  const page = await pagina('<body><app-historial-siniestralidad><mat-select formcontrolname="companiaAnterior" style="display:inline-block;min-width:80px;min-height:14px">x</mat-select></app-historial-siniestralidad></body>')
  assert.equal(await companiaAnteriorSinControl(page, undefined, 0), false)
})

test('dos «Compañia» habilitados visibles = ambiguo: no es «sin control» (rige el atasco de siempre)', async () => {
  const page = await pagina(`<body>${COMPANIA}${COMPANIA}</body>`)
  assert.equal(await companiaAnteriorSinControl(page, undefined, 0), false)
})

test('el aviso fijo viaja en CADA oferta y dice que la toma Mapfre de su historial', () => {
  assert.equal(AVISO_COMPANIA_ANTERIOR_NO_PEDIDA, 'Compañía anterior y siniestralidad no las pide Mapfre en esta pantalla: las toma de su consulta de historial; revísalo en la emisión.')
  const o = ofertasDesdePrimasMapfre([{ producto: 'X', primaTotalEur: 100, requiereVerificacionVehiculo: false }] as never, null, null, null, [AVISO_COMPANIA_ANTERIOR_NO_PEDIDA])
  assert.ok(o[0]!.avisos.includes(AVISO_COMPANIA_ANTERIOR_NO_PEDIDA))
})

test('cableado: Datos básicos no toca «Compañia»; Figuras omite la compañía solo si no hay control y deja el aviso', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /companiaAnteriorEnDatosBasicos\(|companiaYaElegida\s*=|mapfre_compania_en_datos_basicos'/)
  assert.match(src, /await continuar\(nsei, ctx, 'datosBasicos'\)\s*await r\.confirmar\(\)/)
  assert.match(src, /const sinControlCompania = tieneOpCompania && \(await companiaAnteriorSinControl\(nsei, ctx\.pulsar\)\)/)
  assert.match(src, /!\(sinControlCompania && o\.sel === SEL_HISTORIAL\.companiaAnterior\)/)
  assert.match(src, /\.\.\.\(sinControlCompania \? \[AVISO_COMPANIA_ANTERIOR_NO_PEDIDA\] : \[\]\)/)
})
