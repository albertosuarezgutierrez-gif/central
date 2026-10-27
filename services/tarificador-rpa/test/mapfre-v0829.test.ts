// Mapfre auto v0.8.29 (27/10/2026): con 0.8.28 la producción seguía fallando: el diagnóstico veía «compania» mat-select[compania] habilitado y la
// SELECCIÓN no. Causa: la selección contaba como candidatos TODOS los mat-select del contenedor de la etiqueta «Compañia» (si la etiqueta no está en un
// mat-form-field, el contenedor es su padre y trae también los mat-select deshabilitados vecinos) → «ambiguo» → null → hueco. El diagnóstico solo tomaba
// el primer control de la etiqueta. Ahora ambos usan `leerControlesSiniestralidad`. Y «sin lector de opciones» era el mensaje de CUALQUIER null, no del cableado.
// Fixtures SINTÉTICAS (sin datos personales).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { describirBloqueHistorial, mapfreAuto, rellenarMatSelects, selectCompaniaPorEtiqueta, SEL_HISTORIAL } from '../src/adapters/mapfre/auto.ts'
import { ErrorOpcionSinResolver } from '../src/mat-select.ts'

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
const SEL = (attrs: string) => `<mat-select ${attrs} style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>`
const OFF = '<mat-select formcontrolname="descuento" aria-disabled="true" class="mat-select-disabled" style="display:inline-block;min-width:80px;min-height:14px"></mat-select>'
const PROC = '<mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field>'
// Variante A: etiqueta «Compañia» SIN mat-form-field; su contenedor (div) trae además un mat-select deshabilitado vecino.
const SUELTA = (sel: string) => `<body><app-figuras><div><label>Compañia</label>${sel}${OFF}</div>${PROC}</app-figuras></body>`
// Variante B: mat-form-field normal + otro bloque con otra etiqueta «Compañía» cuyo mat-select viene deshabilitado.
const DOS = (sel: string) => `<body><app-figuras><mat-form-field><label><mat-label>Compañia</mat-label></label>${sel}</mat-form-field>${PROC}</app-figuras>
<app-info-descuentos><mat-form-field class="mat-form-field-disabled"><label><mat-label>Compañía</mat-label></label>${OFF}</mat-form-field></app-info-descuentos></body>`
const PLAN = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never
const ATRIBUTOS = ['formcontrolname="compania"', 'name="compania"', 'id="compania"'] as const

test('v0.8.29 · la versión del bot es 0.8.29', () => assert.equal(mapfreAuto.version, '0.8.33'))

for (const attrs of ATRIBUTOS) {
  for (const [nombre, dom] of [['etiqueta suelta + vecino deshabilitado', SUELTA], ['dos bloques «Compañía», uno deshabilitado', DOS]] as const) {
    test(`${nombre} [${attrs}]: la selección halla el MISMO control que el diagnóstico y lo elige por la capa común`, async () => {
      const page = await pagina(dom(SEL(attrs)))
      const diag = await describirBloqueHistorial(page)
      assert.match(diag, /no existe app-historial-siniestralidad/, diag)
      assert.match(diag, /«compania» mat-select\[compania\] habilitado/, diag)
      const loc = await selectCompaniaPorEtiqueta(page)
      assert.ok(loc, 'el diagnóstico lo ve habilitado pero la selección no lo halló')
      assert.equal(await loc.evaluate((e) => e.getAttribute('formcontrolname') ?? e.getAttribute('name') ?? e.id), 'compania')
      const elegidas: string[][] = []
      const hechos = await rellenarMatSelects(page, PLAN, { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o) } } as never, { page, formador: undefined } as never, 0)
      assert.deepEqual(hechos, ['compañía anterior'])
      assert.deepEqual(elegidas, [['ZZ Seguros']])
    })
  }
}

test('el lector de opciones llega al diagnóstico y lee las del mismo control (no «sin lector»)', async () => {
  const page = await pagina(SUELTA(SEL('formcontrolname="compania"')))
  const t = await describirBloqueHistorial(page, async (s: Locator) => { assert.equal(await s.getAttribute('formcontrolname'), 'compania'); return ['Alfa Seguros'] })
  assert.match(t, /«compania»: «Alfa Seguros»/, t)
  assert.doesNotMatch(t, /sin lector/, t)
})

test('sin opción que case: sigue el hueco «datos» con las opciones, no se elige a ciegas', async () => {
  const page = await pagina(SUELTA(SEL('formcontrolname="compania"')))
  await assert.rejects(
    rellenarMatSelects(page, PLAN, { elegirMatSelect: async () => { throw new ErrorOpcionSinResolver('sin opción clara', ['Uno', 'Dos']) } } as never, { page, formador: undefined } as never, 0),
    (e: unknown) => e instanceof ErrorOpcionSinResolver && (e as { opciones?: string[] }).opciones?.join() === 'Uno,Dos',
  )
})

test('dos mat-select «Compañia» HABILITADOS: ambiguo, null (no se adivina); el diagnóstico lo dice sin culpar al lector', async () => {
  const dos = `<body><app-figuras><mat-form-field><label><mat-label>Compañia</mat-label></label>${SEL('formcontrolname="a"')}</mat-form-field><mat-form-field><label><mat-label>Compañia</mat-label></label>${SEL('formcontrolname="b"')}</mat-form-field></app-figuras></body>`
  const page = await pagina(dos)
  assert.equal(await selectCompaniaPorEtiqueta(page), null)
  assert.doesNotMatch(await describirBloqueHistorial(page, async () => null), /sin lector/)
})
