// Mapfre auto v0.8.31 (27/10/2026, ejecución real con 0.8.30): la compañía diferida se resolvió, pero el atasco pasó a «siniestros RC 5 años», del MISMO
// bloque de siniestralidad (oculto en «Figuras»). Ahora los siniestros también se difieren a Coberturas. Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { mapfreAuto, rellenarTextosDiferidos, rellenarTextosSiniestralidad, siniestralidadOcultaEnPantalla, SEL_HISTORIAL } from '../src/adapters/mapfre/auto.ts'

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
const BLOQUE = `<mat-form-field><label><mat-label>Siniestros</mat-label></label><input formcontrolname="siniestros" value=""></mat-form-field>`
const SEL_COMP = '<mat-select formcontrolname="companiaAnterior" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>'
const COMP = `<mat-form-field><label><mat-label>Compañia</mat-label></label>${SEL_COMP}</mat-form-field>`
const OCULTO = `<body><app-tomador></app-tomador><app-historial-siniestralidad id="h" style="display:none">${COMP}${BLOQUE}</app-historial-siniestralidad></body>`
const OP = { sel: SEL_HISTORIAL.siniestrosRc5, etiqueta: 'siniestros RC 5 años', tipo: 'texto', valor: '2', paso: 'figuras' } as never
const R = (page: Page) => ({ page, formador: undefined }) as never
const valor = (page: Page) => page.locator(SEL_HISTORIAL.siniestrosRc5).inputValue()

test('v0.8.31 · la versión del bot es 0.8.31', () => assert.equal(mapfreAuto.version, '0.8.31'))

test('bloque de siniestralidad OCULTO en «Figuras»: los siniestros se DIFIEREN (ni se escriben ni se omiten ni atascan)', async () => {
  const page = await pagina(OCULTO)
  assert.equal(await siniestralidadOcultaEnPantalla(page), true)
  const dif: unknown[] = []
  const hechos = await rellenarTextosSiniestralidad(page, [OP], R(page), dif as never, false)
  assert.deepEqual(hechos, [])
  assert.equal(dif.length, 1)
  assert.equal(await valor(page), '')
})

test('compañía ya diferida (`bloqueDiferido`) y campo ausente en esta pantalla: se difiere también', async () => {
  const page = await pagina('<body><app-tomador></app-tomador></body>')
  const dif: unknown[] = []
  await rellenarTextosSiniestralidad(page, [OP], R(page), dif as never, true)
  assert.equal(dif.length, 1)
})

test('diferido: al hacerse visible el bloque (Coberturas) se escribe con el MISMO helper y queda fijado', async () => {
  const page = await pagina(OCULTO)
  const dif: unknown[] = []
  await rellenarTextosSiniestralidad(page, [OP], R(page), dif as never, false)
  await page.evaluate(() => { (document.getElementById('h') as HTMLElement).style.display = 'block' })
  const hechos = await rellenarTextosDiferidos(page, dif as never, R(page), 0)
  assert.deepEqual(hechos, [])
  assert.equal(await valor(page), '2')
})

test('diferido y tampoco visible en el segundo paso → hueco «no aparece»/atasco (nunca se omite)', async () => {
  const page = await pagina(OCULTO)
  const dif: unknown[] = []
  await rellenarTextosSiniestralidad(page, [OP], R(page), dif as never, false)
  await assert.rejects(rellenarTextosDiferidos(page, dif as never, R(page), 0), (e: unknown) => /«siniestros RC 5 años».*no aparece.*tampoco se ve en Coberturas/.test(String((e as Error).message)))
})

test('sin regresión: campo VISIBLE se escribe aquí; campo ausente sin bloque oculto sigue siendo hueco', async () => {
  const visible = await pagina(`<body><app-historial-siniestralidad>${COMP}${BLOQUE}</app-historial-siniestralidad></body>`)
  assert.equal(await siniestralidadOcultaEnPantalla(visible), false)
  const dif: unknown[] = []
  await rellenarTextosSiniestralidad(visible, [OP], R(visible), dif as never, false)
  assert.equal(dif.length, 0)
  assert.equal(await valor(visible), '2')
  const vacia = await pagina('<body><app-tomador></app-tomador></body>')
  assert.equal(await siniestralidadOcultaEnPantalla(vacia), false)
  await assert.rejects(rellenarTextosSiniestralidad(vacia, [OP], R(vacia), [] as never, false), /no aparece/)
})

test('cableado: Figuras difiere los siniestros; tras continuar y las primas se rellenan (póliza → siniestros) y se RELEEN las primas', () => {
  const src = readFileSync(new URL('../src/adapters/mapfre/auto.ts', import.meta.url), 'utf8')
  assert.match(src, /await rellenarTextosSiniestralidad\(nsei, [^\n]*respaldo, diferidosTexto, diferidos\.length > 0\)/)
  assert.match(src, /await continuar\(nsei, ctx, 'figuras'\)[\s\S]*?if \(diferidos\.length > 0 \|\| diferidosTexto\.length > 0\) \{[\s\S]*?historialAnterior[\s\S]*?rellenarTextosDiferidos\(nsei, diferidosTexto[\s\S]*?primas = await esperarPrimasMapfre/)
})
