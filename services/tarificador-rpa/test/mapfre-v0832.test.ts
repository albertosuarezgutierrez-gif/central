// Mapfre auto v0.8.32 (27/10/2026, ejecución real 8ef7a5dc con 0.8.31): el diagnóstico dijo por fin DÓNDE vive cada control. (1) El único «Compañia» habilitado
// es de `app-datos-basicos` (paso 1) y el stepper lo oculta (visibility:hidden) al pasar de paso: se elige en «Datos básicos». (2) Procedencia / expuestos /
// siniestros son de `app-info-descuentos` (Coberturas), DESHABILITADOS tras un acordeón plegado: los fija Mapfre; el bot no los escribe, los lee y avisa.
// Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { avisoSiniestralidadMapfre, leerSiniestralidadMapfre, mapfreAuto, ofertasDesdePrimasMapfre, siniestralidadFijadaPorMapfre } from '../src/adapters/mapfre/auto.ts'

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
// Estructura REAL vista: el stepper pinta todos los pasos; el activo se ve, los demás van con visibility:hidden.
const PASO_1 = (visible: boolean) => `<mat-stepper><div class="mat-horizontal-stepper-content" style="visibility:${visible ? 'visible' : 'hidden'}"><app-datos-basicos>${COMPANIA}</app-datos-basicos></div></mat-stepper>`
const INFO = (siniestros: string, off = true) => `<app-coberturas><app-info-descuentos><mat-accordion><mat-expansion-panel><mat-expansion-panel-header>Info</mat-expansion-panel-header><div class="mat-expansion-panel-content" style="visibility:hidden">
<mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" value="SINCO" ${off ? 'disabled' : ''}></mat-form-field>
<mat-form-field><label><mat-label>Expuestos/Años</mat-label></label><input formcontrolname="expuestos" value="5" ${off ? 'disabled' : ''}></mat-form-field>
<mat-form-field><label><mat-label>Siniestros</mat-label></label><input formcontrolname="siniestros" value="${siniestros}" ${off ? 'disabled' : ''}></mat-form-field>
</div></mat-expansion-panel></mat-accordion></app-info-descuentos></app-coberturas>`

test('v0.8.32 · la versión del bot es 0.8.33 (o posterior)', () => assert.equal(mapfreAuto.version, '0.8.38'))

test('siniestralidad DESHABILITADA tras acordeón plegado = la fija Mapfre; habilitada o ausente = no', async () => {
  assert.equal(await siniestralidadFijadaPorMapfre(await pagina(`<body>${INFO('2')}</body>`)), true)
  assert.equal(await siniestralidadFijadaPorMapfre(await pagina(`<body>${INFO('2', false)}</body>`)), false)
  assert.equal(await siniestralidadFijadaPorMapfre(await pagina('<body><app-tomador></app-tomador></body>')), false)
})

test('lee lo que puso Mapfre (aunque esté oculto) y NO lee nada de «Compañia»', async () => {
  const page = await pagina(`<body>${PASO_1(false)}${INFO('2')}</body>`)
  assert.deepEqual(await leerSiniestralidadMapfre(page), { procedencia: 'SINCO', expuestos: '5', siniestros: '2' })
  const vacia = await pagina('<body></body>')
  assert.deepEqual(await leerSiniestralidadMapfre(vacia), { procedencia: null, expuestos: null, siniestros: null })
})

test('aviso: dice que la tomó Mapfre y no se modificó; avisa si el riesgo declara otra cifra; sin cifra legible lo dice', () => {
  const ok = { procedencia: 'SINCO', expuestos: '5', siniestros: '0' }
  assert.match(avisoSiniestralidadMapfre(ok, 0), /^Siniestralidad tomada por Mapfre; no modificada \(procedencia: SINCO; expuestos\/años: 5; siniestros: 0\)\.$/)
  assert.match(avisoSiniestralidadMapfre({ ...ok, siniestros: '2' }, 0), /declara 0 siniestro\(s\).*Mapfre usa 2.*precio es el de Mapfre/)
  assert.match(avisoSiniestralidadMapfre({ procedencia: null, expuestos: null, siniestros: null }, 1), /procedencia: no legible.*declara 1 siniestro\(s\).*no se pudo comprobar/)
  assert.doesNotMatch(avisoSiniestralidadMapfre({ procedencia: null, expuestos: null, siniestros: null }, null), /declara/)
})

test('el aviso viaja en CADA oferta (avisosExtra), sin pasar por supuestos', () => {
  const o = ofertasDesdePrimasMapfre([{ producto: 'X', primaTotalEur: 100, requiereVerificacionVehiculo: false }] as never, null, null, null, ['AVISO-PRUEBA'])
  assert.ok(o[0]!.avisos.includes('AVISO-PRUEBA'))
})

test('cableado: la siniestralidad fijada por Mapfre no se escribe y se avisa; la compañía anterior ya NO se elige en Datos básicos (retirado en 0.8.33)', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.match(src, /if \(fijaMapfre\) ctx\.formador\?\.log\('mapfre_siniestralidad_fijada_por_mapfre'[^\n]*\n\s*else await rellenarCamposTexto\(nsei, \{ escribibles: opsSiniestros/)
  assert.match(src, /avisoSiniestralidadMapfre\(await leerSiniestralidadMapfre\(nsei\)/)
  assert.doesNotMatch(src, /rellenarTextosDiferidos|rellenarTextosSiniestralidad|companiaHabilitadaOculta|const diferidos|diferidosTexto/)
})
