// Mapfre auto v0.8.28 (27/10/2026): producción sin `app-historial-siniestralidad` (etiqueta «Compañia» + mat-select formcontrolname="compania" habilitado)
// terminaba en «mapa incompleto … no aparece»: el respaldo por etiqueta se leía UNA sola vez, justo al salir de la espera, antes de que la pantalla
// terminara de pintar (o mientras el control aún estaba deshabilitado). Ahora espera (sondea) y, si falla, el diagnóstico LEE las opciones.
// Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { describirBloqueHistorial, mapfreAuto, rellenarMatSelects, selectCompaniaPorEtiqueta, SEL_HISTORIAL } from '../src/adapters/mapfre/auto.ts'

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
const SELECT = (extra = '') => `<mat-select formcontrolname="compania" ${extra} style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>`
// Variante de producción: SIN app-historial-siniestralidad; «Compañia» + mat-select habilitado; «Procedencia Siniestralidad» deshabilitado.
const FIGURAS = (sel: string) => `<body><app-figuras><mat-form-field><label><mat-label>Compañia</mat-label></label>${sel}</mat-form-field>
<mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field>
<mat-form-field><label><mat-label>Expuestos/Años</mat-label></label><input formcontrolname="expuestos" disabled></mat-form-field></app-figuras></body>`
const PLAN = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never

test('v0.8.28 · la versión del bot es 0.8.29', () => assert.equal(mapfreAuto.version, '0.8.46'))

test('DOM de producción (sin app-historial-siniestralidad, «Compañia» + mat-select habilitado): rellenarMatSelects lo elige con la capa común', async () => {
  const page = await pagina(FIGURAS(SELECT()))
  const elegidas: string[][] = []
  const hechos = await rellenarMatSelects(page, PLAN, { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o) } } as never, { page, formador: undefined } as never, 0)
  assert.deepEqual(hechos, ['compañía anterior'])
  assert.deepEqual(elegidas, [['ZZ Seguros']])
})

test('el control se pinta con retraso (mat-select aún no existe al salir de la espera): se sondea y se usa', async () => {
  const page = await pagina(FIGURAS('').replace('</mat-form-field>\n<mat-form-field><label><mat-label>Procedencia', '<span id="hueco"></span></mat-form-field>\n<mat-form-field><label><mat-label>Procedencia'))
  await page.evaluate((html) => { setTimeout(() => { document.getElementById('hueco')!.outerHTML = html }, 700) }, SELECT())
  const loc = await selectCompaniaPorEtiqueta(page, undefined, 4_000)
  assert.ok(loc)
  assert.equal(await loc.getAttribute('formcontrolname'), 'compania')
})

test('el control nace deshabilitado (aria-disabled) y se habilita con retraso: se espera a que esté habilitado', async () => {
  const page = await pagina(FIGURAS(SELECT('id="c" aria-disabled="true"')))
  await page.evaluate(() => { setTimeout(() => document.getElementById('c')!.setAttribute('aria-disabled', 'false'), 700) })
  const loc = await selectCompaniaPorEtiqueta(page, undefined, 4_000)
  assert.ok(loc)
})

test('sin espera y sin control: null (no se inventa nada); deshabilitado para siempre: null tras agotar la espera', async () => {
  assert.equal(await selectCompaniaPorEtiqueta(await pagina('<body><app-figuras></app-figuras></body>')), null)
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(FIGURAS(SELECT('aria-disabled="true"'))), undefined, 600), null)
})

test('sin opción que case: el hueco «datos» de siempre (ErrorOpcionSinResolver con las opciones), no se elige a ciegas', async () => {
  const page = await pagina(FIGURAS(SELECT()))
  const { ErrorOpcionSinResolver } = await import('../src/mat-select.ts')
  await assert.rejects(
    rellenarMatSelects(page, PLAN, { elegirMatSelect: async () => { throw new ErrorOpcionSinResolver('sin opción clara', ['Uno', 'Dos']) } } as never, { page, formador: undefined } as never, 0),
    (e: unknown) => e instanceof ErrorOpcionSinResolver && (e as { opciones?: string[] }).opciones?.join() === 'Uno,Dos',
  )
})

test('diagnóstico: con lector guardado LEE las opciones de «Compañia» (sin valores); sin lector, dice que no las leyó', async () => {
  const page = await pagina(FIGURAS(SELECT('id="c"')))
  let lecturas = 0
  const leer = async (sel: Locator) => { lecturas++; assert.equal(await sel.getAttribute('formcontrolname'), 'compania'); return ['Alfa Seguros', 'Beta Seguros', 'Alfa Seguros'] }
  const t = await describirBloqueHistorial(page, leer)
  assert.equal(lecturas, 1)
  assert.match(t, /«compania»: «Alfa Seguros», «Beta Seguros»/, t)
  assert.doesNotMatch(t, /no leídas/, t)
  assert.match(await describirBloqueHistorial(await pagina(FIGURAS(SELECT()))), /no leídas/)
})

test('leerOpcionesMatSelect (mat-select.ts): abre por pulsar, lee las opciones visibles, cierra por el telón y no elige', async () => {
  const { leerOpcionesMatSelect } = await import('../src/mat-select.ts')
  const page = await pagina(FIGURAS(SELECT('id="c"')).replace('</body>', '<div class="cdk-overlay-container"></div></body>'))
  const pulsos: string[] = []
  const pulsar = async (b: Locator) => {
    const telon = await b.evaluate((e) => e.classList.contains('cdk-overlay-backdrop'))
    pulsos.push(telon ? 'telon' : 'select')
    await b.evaluate((_e, t) => {
      document.querySelector('.cdk-overlay-container')!.innerHTML = t ? '' : '<div class="cdk-overlay-backdrop" style="display:block;width:10px;height:10px"></div><div><mat-option style="display:block">Alfa Seguros</mat-option><mat-option style="display:block">Beta Seguros</mat-option></div>'
    }, telon)
  }
  const r = await leerOpcionesMatSelect(page.locator('mat-select'), { pulsar })
  assert.deepEqual(r, ['Alfa Seguros', 'Beta Seguros'])
  assert.deepEqual(pulsos, ['select', 'telon'])
  assert.equal(await leerOpcionesMatSelect(await pagina(FIGURAS(SELECT('aria-disabled="true"'))).then((p) => p.locator('mat-select')), { pulsar }), null)
})
