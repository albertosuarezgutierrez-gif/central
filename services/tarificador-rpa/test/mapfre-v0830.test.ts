// Mapfre auto v0.8.30 (27/10/2026, trabajo real con 0.8.29, captura del atasco): «Figuras» (pestaña Tomador: Datos Básicos, Dirección Habitual, Permiso
// Conducir) NO pinta ningún bloque de siniestralidad. El diagnóstico decía «compania» mat-select habilitado, pero ese control NO se veía (la selección exige
// visible) y el diagnóstico no daba el motivo: ni si estaba oculto ni en qué componente vive (la lista de 20 controles del atasco es el inventario genérico y
// corta antes). 0.8.28 (esperar 6 s) y 0.8.29 (unificar localizador) no atacaban eso. Ahora el diagnóstico dice VISIBLE/OCULTO, por qué y el componente.
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
const SEL = '<mat-select formcontrolname="compania" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>'
const CAMPO = (sel: string) => `<mat-form-field><label><mat-label>Compañia</mat-label></label>${sel}</mat-form-field><mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field>`
const FIGURAS = '<app-tomador><datos-licencia><mat-form-field><label><mat-label>Clase</mat-label></label><mat-select formcontrolname="codigoTipoLicencia" style="display:inline-block;min-width:80px;min-height:14px"></mat-select></mat-form-field></datos-licencia></app-tomador>'
// (los tests de «compañía diferida» de 0.8.30 se retiraron en 0.8.32: el desplegable es de «Datos básicos», ver mapfre-v0832.test.ts)
const PLAN = { escribibles: [{ sel: SEL_HISTORIAL.companiaAnterior, tipo: 'mat-select', etiqueta: 'compañía anterior', paso: 'figuras', valor: 'ZZ Seguros', opciones: ['ZZ Seguros'] }], pendientes: [] } as never

test('v0.8.30 · la versión del bot es 0.8.30', () => assert.equal(mapfreAuto.version, '0.8.38'))

test('«Compañia» habilitado en otro componente OCULTO (display:none): el diagnóstico lo dice con el motivo y el componente; la selección no lo toca', async () => {
  const page = await pagina(`<body>${FIGURAS}<app-info-descuentos style="display:none">${CAMPO(SEL)}</app-info-descuentos></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /«compania» mat-select\[compania\] habilitado OCULTO por app-info-descuentos display:none \(en app-info-descuentos\)/, diag)
  assert.match(diag, /OCULTO en esta pantalla/, diag)
  assert.doesNotMatch(diag, /sin lector|no es único, visible/, diag)
  assert.equal(await selectCompaniaPorEtiqueta(page), null)
  const elegidas: string[][] = []
  await assert.rejects(
    rellenarMatSelects(page, PLAN, { elegirMatSelect: async (_s: Locator, o: string[]) => { elegidas.push(o) } } as never, { page, formador: undefined } as never, 0),
    (e: unknown) => /no aparece/.test(String((e as Error).message)) && /habilitado OCULTO por app-info-descuentos display:none/.test(String((e as Error).message)),
  )
  assert.deepEqual(elegidas, [])
})

test('«Compañia» en una pestaña inactiva (mat-tab-body sin «active»): se declara como pestaña inactiva', async () => {
  const page = await pagina(`<body>${FIGURAS}<mat-tab-body class="mat-tab-body" style="display:none"><app-conductor>${CAMPO(SEL)}</app-conductor></mat-tab-body></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /habilitado OCULTO por .*\(pestaña inactiva\) \(en app-conductor < mat-tab-body\)/, diag)
})

test('«Compañia» VISIBLE: el diagnóstico no añade «OCULTO» y la selección lo halla (sin regresión)', async () => {
  const page = await pagina(`<body><app-figuras>${CAMPO(SEL)}</app-figuras></body>`)
  const diag = await describirBloqueHistorial(page)
  assert.match(diag, /«compania» mat-select\[compania\] habilitado;/)
  assert.doesNotMatch(diag, /OCULTO/)
  assert.ok(await selectCompaniaPorEtiqueta(page))
})

test('el diagnóstico no vuelca texto de la pantalla (solo etiquetas, clases y nombres de control)', async () => {
  const page = await pagina(`<body><app-info-descuentos style="display:none">${CAMPO(SEL.replace('<span>x</span>', '<span>NIF 00000000T</span>'))}</app-info-descuentos></body>`)
  assert.doesNotMatch(await describirBloqueHistorial(page), /00000000T/)
})
